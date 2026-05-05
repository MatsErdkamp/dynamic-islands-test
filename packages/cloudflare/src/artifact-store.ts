import {
  createArtifactIntegrity,
  type EditableArtifact,
} from "@superobjective/editable-core";
import { ensureSqliteSchema } from "./sqlite-schema.js";
import type { DurableObjectStorageLike } from "./bindings.js";

export type ActiveArtifactRecord = {
  artifact: EditableArtifact;
  version: number;
  updatedAt: string;
};

export type ToolCallRecord = {
  id: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  source: string;
  createdAt: string;
};

export interface ArtifactStore {
  putArtifact(artifact: EditableArtifact): Promise<void>;
  getArtifact(id: string): Promise<EditableArtifact | undefined>;
  activateArtifact(islandId: string, artifactId: string): Promise<number>;
  clearActiveArtifact(islandId: string): Promise<number>;
  getActiveArtifact(
    islandId: string,
  ): Promise<ActiveArtifactRecord | undefined>;
  getViewState(): Promise<Record<string, unknown>>;
  setViewState(key: string, value: unknown): Promise<void>;
  logToolCall(record: ToolCallRecord): Promise<void>;
}

export function createArtifactStore(
  storage: DurableObjectStorageLike | undefined,
): ArtifactStore {
  if (storage?.sql) {
    return new SqliteArtifactStore(storage);
  }

  return new InMemoryArtifactStore();
}

export class InMemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, EditableArtifact>();
  private readonly active = new Map<
    string,
    { artifactId: string; version: number; updatedAt: string }
  >();
  private readonly viewState = new Map<string, unknown>();
  private readonly toolCalls: ToolCallRecord[] = [];

  async putArtifact(artifact: EditableArtifact): Promise<void> {
    this.artifacts.set(artifact.id, artifact);
  }

  async getArtifact(id: string): Promise<EditableArtifact | undefined> {
    return this.artifacts.get(id);
  }

  async activateArtifact(
    islandId: string,
    artifactId: string,
  ): Promise<number> {
    const existing = this.active.get(islandId);
    const version = (existing?.version ?? 0) + 1;
    const updatedAt = new Date().toISOString();
    const artifact = this.artifacts.get(artifactId);

    if (!artifact) {
      throw new Error(`Cannot activate unknown artifact "${artifactId}".`);
    }

    this.artifacts.set(artifactId, { ...artifact, status: "active" });
    this.active.set(islandId, { artifactId, version, updatedAt });

    return version;
  }

  async clearActiveArtifact(islandId: string): Promise<number> {
    const existing = this.active.get(islandId);
    const version = (existing?.version ?? 0) + 1;

    this.active.delete(islandId);

    return version;
  }

  async getActiveArtifact(
    islandId: string,
  ): Promise<ActiveArtifactRecord | undefined> {
    const active = this.active.get(islandId);

    if (!active) {
      return undefined;
    }

    const artifact = this.artifacts.get(active.artifactId);

    if (!artifact) {
      return undefined;
    }

    return {
      artifact,
      version: active.version,
      updatedAt: active.updatedAt,
    };
  }

  async getViewState(): Promise<Record<string, unknown>> {
    return Object.fromEntries(this.viewState.entries());
  }

  async setViewState(key: string, value: unknown): Promise<void> {
    this.viewState.set(key, value);
  }

  async logToolCall(record: ToolCallRecord): Promise<void> {
    this.toolCalls.push(record);
  }
}

export class SqliteArtifactStore implements ArtifactStore {
  private initialized = false;

  constructor(private readonly storage: DurableObjectStorageLike) {}

  async putArtifact(artifact: EditableArtifact): Promise<void> {
    this.ensureReady();
    this.storage.sql?.exec(
      `
      INSERT OR REPLACE INTO artifacts (
        id,
        island_id,
        kind,
        source_tsx,
        compiled_client_js,
        compiled_server_js,
        compiled_css,
        integrity,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      artifact.id,
      artifact.islandId,
      artifact.kind,
      artifact.sourceTsx,
      artifact.compiledClientJs ?? null,
      artifact.compiledServerJs ?? null,
      artifact.compiledCss ?? null,
      artifact.integrity,
      artifact.status,
      artifact.createdAt,
    );
  }

  async getArtifact(id: string): Promise<EditableArtifact | undefined> {
    this.ensureReady();
    const row = firstRow(
      this.storage.sql?.exec<ArtifactRow>(
        `
        SELECT *
        FROM artifacts
        WHERE id = ?
        `,
        id,
      ),
    );

    return row ? artifactFromRow(row) : undefined;
  }

  async activateArtifact(
    islandId: string,
    artifactId: string,
  ): Promise<number> {
    this.ensureReady();
    const existing = firstRow(
      this.storage.sql?.exec<{ version: number }>(
        `
        SELECT version
        FROM active_artifacts
        WHERE island_id = ?
        `,
        islandId,
      ),
    );
    const version = Number(existing?.version ?? 0) + 1;
    const updatedAt = new Date().toISOString();

    this.storage.sql?.exec(
      `
      UPDATE artifacts
      SET status = 'active'
      WHERE id = ?
      `,
      artifactId,
    );
    this.storage.sql?.exec(
      `
      INSERT OR REPLACE INTO active_artifacts (
        island_id,
        artifact_id,
        version,
        updated_at
      ) VALUES (?, ?, ?, ?)
      `,
      islandId,
      artifactId,
      version,
      updatedAt,
    );

    return version;
  }

  async clearActiveArtifact(islandId: string): Promise<number> {
    this.ensureReady();
    const existing = firstRow(
      this.storage.sql?.exec<{ version: number }>(
        `
        SELECT version
        FROM active_artifacts
        WHERE island_id = ?
        `,
        islandId,
      ),
    );
    const version = Number(existing?.version ?? 0) + 1;

    this.storage.sql?.exec(
      `
      DELETE FROM active_artifacts
      WHERE island_id = ?
      `,
      islandId,
    );

    return version;
  }

  async getActiveArtifact(
    islandId: string,
  ): Promise<ActiveArtifactRecord | undefined> {
    this.ensureReady();
    const row = firstRow(
      this.storage.sql?.exec<ArtifactRow & { version: number; active_updated_at: string }>(
        `
        SELECT
          artifacts.*,
          active_artifacts.version,
          active_artifacts.updated_at AS active_updated_at
        FROM active_artifacts
        JOIN artifacts ON artifacts.id = active_artifacts.artifact_id
        WHERE active_artifacts.island_id = ?
        `,
        islandId,
      ),
    );

    if (!row) {
      return undefined;
    }

    return {
      artifact: artifactFromRow(row),
      version: Number(row.version),
      updatedAt: String(row.active_updated_at),
    };
  }

  async getViewState(): Promise<Record<string, unknown>> {
    this.ensureReady();
    const rows =
      this.storage.sql
        ?.exec<{ key: string; value_json: string }>(
          `
          SELECT key, value_json
          FROM view_state
          `,
        )
        .toArray?.() ?? [];

    return Object.fromEntries(
      rows.map((row) => [row.key, JSON.parse(row.value_json) as unknown]),
    );
  }

  async setViewState(key: string, value: unknown): Promise<void> {
    this.ensureReady();
    this.storage.sql?.exec(
      `
      INSERT OR REPLACE INTO view_state (
        key,
        value_json,
        updated_at
      ) VALUES (?, ?, ?)
      `,
      key,
      JSON.stringify(value),
      new Date().toISOString(),
    );
  }

  async logToolCall(record: ToolCallRecord): Promise<void> {
    this.ensureReady();
    this.storage.sql?.exec(
      `
      INSERT INTO tool_calls (
        id,
        tool_name,
        input_json,
        output_json,
        source,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      record.id,
      record.toolName,
      JSON.stringify(record.input),
      record.output === undefined ? null : JSON.stringify(record.output),
      record.source,
      record.createdAt,
    );
  }

  private ensureReady(): void {
    if (this.initialized) {
      return;
    }

    ensureSqliteSchema(this.storage);
    this.initialized = true;
  }
}

type ArtifactRow = {
  id: string;
  island_id: string;
  kind: EditableArtifact["kind"];
  source_tsx: string;
  compiled_client_js?: string | null;
  compiled_server_js?: string | null;
  compiled_css?: string | null;
  integrity: string;
  status: EditableArtifact["status"];
  created_at: string;
};

function artifactFromRow(row: ArtifactRow): EditableArtifact {
  return {
    id: row.id,
    islandId: row.island_id,
    kind: row.kind,
    sourceTsx: row.source_tsx,
    compiledClientJs: row.compiled_client_js ?? undefined,
    compiledServerJs: row.compiled_server_js ?? undefined,
    compiledCss: row.compiled_css ?? undefined,
    integrity:
      row.integrity ??
      createArtifactIntegrity({
        sourceTsx: row.source_tsx,
        compiledClientJs: row.compiled_client_js ?? undefined,
        compiledServerJs: row.compiled_server_js ?? undefined,
        kind: row.kind,
      }),
    status: row.status,
    createdAt: row.created_at,
  };
}

function firstRow<T>(
  result:
    | {
        one(): T | undefined;
        toArray?(): T[];
      }
    | undefined,
): T | undefined {
  if (!result) {
    return undefined;
  }

  if (result.toArray) {
    return result.toArray()[0];
  }

  try {
    return result.one();
  } catch (error) {
    if (
      error instanceof Error &&
      /no results|zero rows|got no results/i.test(error.message)
    ) {
      return undefined;
    }

    throw error;
  }
}
