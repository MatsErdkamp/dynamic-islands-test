import {
  artifactUrl,
  createMemoryEditableViewState,
  stableHash,
  toToolManifest,
  type EditableActor,
  type EditableBoot,
  type EditableCallSource,
  type EditableIsland,
} from "@superobjective/editable-core";
import { createArtifactStore, type ArtifactStore } from "./artifact-store.js";
import type {
  DurableObjectStateLike,
  OrchestratorOptions,
  SuperobjectiveCloudflareEnv,
} from "./bindings.js";
import { compileEditableArtifact } from "./dynamic-worker.js";
import { artifactHeaders, bootHeaders, noStoreJsonHeaders, unquoteEtag } from "./headers.js";
import {
  EditableWebSocketHub,
  createWebSocketPair,
} from "./websocket.js";

type BootCache = {
  etag: string;
  version: number;
  payload: EditableBoot;
  expiresAt: number;
};

type BootBody = {
  islandId?: string;
  etag?: string;
};

type CallBody = {
  islandId?: string;
  name: string;
  input?: unknown;
  source?: EditableCallSource;
  artifactId?: string;
};

type EditBody = {
  islandId?: string;
  intent?: string;
  sourceTsx?: string;
  files?: Record<string, string>;
  entrypoint?: string;
  draft?: {
    id?: string;
    sourceTsx: string;
    files?: Record<string, string>;
    entrypoint?: string;
    kind?: "generated-client" | "generated-server-fragment";
  };
};

const DEFAULT_EDIT_MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";
const DEFAULT_AI_GATEWAY_ID = "default";

export type OrchestratorDurableObjectClass<
  Env extends SuperobjectiveCloudflareEnv = SuperobjectiveCloudflareEnv,
> = new (
  state: DurableObjectStateLike | undefined,
  env: Env,
) => {
  fetch(request: Request): Promise<Response>;
};

export function createOrchestratorDurableObject<
  Env extends SuperobjectiveCloudflareEnv = SuperobjectiveCloudflareEnv,
>(options: OrchestratorOptions<Env>): OrchestratorDurableObjectClass<Env> {
  class SuperobjectiveOrchestrator {
    private readonly state: DurableObjectStateLike;
    private readonly env: Env;
    private readonly store: ArtifactStore;
    private readonly islands = new Map<string, EditableIsland>();
    private readonly bootCaches = new Map<string, BootCache>();
    private readonly sockets = new EditableWebSocketHub();

    constructor(state: DurableObjectStateLike = {}, env: Env) {
      this.state = state;
      this.env = env;
      this.store = createArtifactStore(state.storage);

      for (const island of options.islands) {
        this.islands.set(island.id, island);
      }
    }

    async fetch(request: Request): Promise<Response> {
      try {
        const url = new URL(request.url);

        if (request.method === "POST" && url.pathname === "/boot") {
          return this.handleBoot(request);
        }

        if (request.method === "POST" && url.pathname === "/call") {
          return this.handleCall(request);
        }

        if (request.method === "GET" && url.pathname === "/tools") {
          return this.handleTools(request);
        }

        if (request.method === "POST" && url.pathname === "/prewarm") {
          return this.handleBoot(request);
        }

        if (request.method === "POST" && url.pathname === "/edit") {
          return this.handleEdit(request);
        }

        if (request.method === "POST" && url.pathname === "/reset") {
          return this.handleReset(request);
        }

        if (request.method === "GET" && url.pathname === "/ws") {
          return this.handleWebSocket(request);
        }

        const artifactMatch = url.pathname.match(
          /^\/artifact\/([^/]+)\.js$/,
        );

        if (request.method === "GET" && artifactMatch?.[1]) {
          return this.handleArtifact(decodeURIComponent(artifactMatch[1]));
        }

        return json({ error: "Not found" }, { status: 404 });
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "Unknown orchestrator error",
          },
          { status: 500 },
        );
      }
    }

    private async handleBoot(request: Request): Promise<Response> {
      const body = await readJson<BootBody>(request);
      const island = this.resolveIsland(body.islandId);
      const requestEtag = body.etag ?? unquoteEtag(request.headers.get("If-None-Match"));
      const result = await this.boot(island, requestEtag);

      if (result.status === "not_modified") {
        return new Response(null, {
          status: 304,
          headers: bootHeaders({
            etag: result.etag,
            privateMaxAge: island.cache.boot.browserPrivateMaxAge,
            swr: island.cache.boot.swr,
          }),
        });
      }

      return json(result, {
        headers: bootHeaders({
          etag: result.etag,
          privateMaxAge: island.cache.boot.browserPrivateMaxAge,
          swr: island.cache.boot.swr,
        }),
      });
    }

    private async handleCall(request: Request): Promise<Response> {
      const body = await readJson<CallBody>(request);
      const island = this.resolveIsland(body.islandId);
      const actor = await options.deriveActor?.({ request, env: this.env });
      const currentState = await this.store.getViewState();
      let viewChanged = false;
      const view = createMemoryEditableViewState(currentState, async (key, value) => {
        viewChanged = true;
        await this.store.setViewState(key, value);
      });

      if (body.name === "__view.set") {
        const input = body.input as { key?: unknown; value?: unknown };

        if (typeof input?.key !== "string") {
          return json({ error: "__view.set requires a string key." }, { status: 400 });
        }

        await view.set(input.key, input.value);
        this.invalidateBoot(island.id);
        this.sockets.broadcast({ type: "view.updated", islandId: island.id });

        return json({
          ok: true,
          output: { ok: true },
          viewState: await this.store.getViewState(),
        });
      }

      const tool = island.tools.find((item) => item.name === body.name);

      if (!tool) {
        return json({ error: `Unknown tool "${body.name}".` }, { status: 404 });
      }

      const ctx = {
        env: this.env,
        request,
        actor,
        islandId: island.id,
        ...(await options.createExecutionContext?.({
          request,
          env: this.env,
          actor,
          islandId: island.id,
        })),
      };
      const meta = {
        id: crypto.randomUUID(),
        source: body.source ?? "browser",
        islandId: island.id,
        artifactId: body.artifactId,
        timestamp: this.now().toISOString(),
      };
      const parsedInput = tool.parseInput(body.input);
      const output = tool.parseOutput(
        await tool.run({
          input: parsedInput,
          ctx,
          view,
          meta,
        }),
      );

      await this.store.logToolCall({
        id: meta.id,
        toolName: tool.name,
        input: parsedInput,
        output,
        source: meta.source,
        createdAt: meta.timestamp,
      });

      if (viewChanged) {
        this.invalidateBoot(island.id);
        this.sockets.broadcast({ type: "view.updated", islandId: island.id });
      }

      return json({
        ok: true,
        output,
        ...(viewChanged ? { viewState: await this.store.getViewState() } : {}),
      });
    }

    private async handleTools(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const island = this.resolveIsland(url.searchParams.get("islandId") ?? undefined);

      return json({ islandId: island.id, tools: toToolManifest(island) });
    }

    private async handleArtifact(artifactId: string): Promise<Response> {
      const artifact = await this.store.getArtifact(artifactId);

      if (!artifact || artifact.status !== "active" || !artifact.compiledClientJs) {
        return new Response("Artifact not found", { status: 404 });
      }

      return new Response(artifact.compiledClientJs, {
        headers: artifactHeaders({
          integrity: artifact.integrity,
          immutable: true,
        }),
      });
    }

    private async handleEdit(request: Request): Promise<Response> {
      const body = await readJson<EditBody>(request);
      const island = this.resolveIsland(body.islandId);
      const sourceTsx =
        body.draft?.sourceTsx ??
        body.sourceTsx ??
        (typeof body.intent === "string"
          ? await generatePromptArtifactSource({
              env: this.env,
              island,
              intent: body.intent,
              actor: await options.deriveActor?.({ request, env: this.env }),
              currentSourceTsx:
                (await this.store.getActiveArtifact(island.id))?.artifact
                  .sourceTsx || island.defaultSourceTsx,
            })
          : undefined);
      const files = body.draft?.files ?? body.files ?? sourceToWorkspaceFiles({
        island,
        sourceTsx,
      });
      const entrypoint =
        body.draft?.entrypoint ?? body.entrypoint ?? generatedEntrypoint(island);

      if (!sourceTsx) {
        return json(
          { error: "POST /edit requires sourceTsx or intent." },
          { status: 400 },
        );
      }

      const compiled = await compileEditableArtifact({
        loader: this.env.SO_LOADER,
        artifactId: body.draft?.id,
        draft: {
          id: body.draft?.id,
          islandId: island.id,
          kind: body.draft?.kind ?? "generated-client",
          sourceTsx,
          files,
          entrypoint,
        },
      });

      await this.store.putArtifact(compiled);
      const version = await this.store.activateArtifact(island.id, compiled.id);
      this.invalidateBoot(island.id);
      const bootResult = await this.boot(island);
      this.sockets.broadcast({
        type: "artifact.updated",
        islandId: island.id,
        version,
        artifactId: compiled.id,
      });

      return json({
        ok: true,
        artifact: {
          id: compiled.id,
          integrity: compiled.integrity,
          url: artifactUrl(island.id, compiled.id),
        },
        version,
        aiGatewayLogId: this.env.AI?.aiGatewayLogId,
        boot: bootResult.status === "ok" ? bootResult.payload : undefined,
      });
    }

    private async handleReset(request: Request): Promise<Response> {
      const body = await readJson<{ islandId?: string }>(request);
      const island = this.resolveIsland(body.islandId);
      const version = await this.store.clearActiveArtifact(island.id);

      this.invalidateBoot(island.id);
      const bootResult = await this.boot(island);
      this.sockets.broadcast({
        type: "artifact.updated",
        islandId: island.id,
        version,
        artifactId: island.defaultArtifact.id,
      });

      return json({
        ok: true,
        version,
        boot: bootResult.status === "ok" ? bootResult.payload : undefined,
      });
    }

    private handleWebSocket(request: Request): Response {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected websocket upgrade", { status: 426 });
      }

      const pair = createWebSocketPair();

      if (!pair) {
        return new Response("WebSocketPair is not available in this runtime", {
          status: 501,
        });
      }

      this.state.acceptWebSocket?.(pair.server);
      this.sockets.add(pair.server);

      return new Response(null, {
        status: 101,
        webSocket: pair.client,
      } as ResponseInit & { webSocket: WebSocket });
    }

    private async boot(island: EditableIsland, etag?: string): Promise<
      | { status: "not_modified"; etag: string }
      | {
          status: "ok";
          payload: EditableBoot;
          etag: string;
          source: "memory" | "sqlite";
        }
    > {
      const cache = this.bootCaches.get(island.id);
      const now = Date.now();

      if (cache && etag === cache.etag) {
        return { status: "not_modified", etag: cache.etag };
      }

      if (cache && now < cache.expiresAt) {
        return {
          status: "ok",
          payload: cache.payload,
          etag: cache.etag,
          source: "memory",
        };
      }

      const payload = await this.rebuildBootFromStore(island);

      this.bootCaches.set(island.id, {
        payload,
        etag: payload.etag,
        version: payload.version,
        expiresAt: now + payload.cache.boot.memoryTtl,
      });

      return {
        status: "ok",
        payload,
        etag: payload.etag,
        source: "sqlite",
      };
    }

    private async rebuildBootFromStore(island: EditableIsland): Promise<EditableBoot> {
      const active = await this.store.getActiveArtifact(island.id);
      const artifact = active?.artifact ?? island.defaultArtifact;
      const version = active?.version ?? 0;
      const viewState = await this.store.getViewState();
      const etag = stableHash({
        islandId: island.id,
        version,
        artifactId: artifact.id,
        artifactIntegrity: artifact.integrity,
        viewState,
        tools: toToolManifest(island),
      });

      return {
        islandId: island.id,
        version,
        etag,
        activeArtifact: {
          id: artifact.id,
          kind: artifact.kind,
          url:
            artifact.kind === "trusted-default"
              ? undefined
              : artifactUrl(island.id, artifact.id),
          integrity: artifact.integrity,
        },
        viewState,
        tools: toToolManifest(island),
        cache: island.cache,
        updatedAt: active?.updatedAt ?? this.now().toISOString(),
      };
    }

    private resolveIsland(islandId: string | undefined): EditableIsland {
      if (islandId) {
        const island = this.islands.get(islandId);

        if (!island) {
          throw new Error(`Unknown island "${islandId}".`);
        }

        return island;
      }

      const [first] = this.islands.values();

      if (!first) {
        throw new Error("No editable islands were registered.");
      }

      return first;
    }

    private invalidateBoot(islandId: string): void {
      this.bootCaches.delete(islandId);
    }

    private now(): Date {
      return options.now?.() ?? new Date();
    }
  }

  return SuperobjectiveOrchestrator as OrchestratorDurableObjectClass<Env>;
}

export async function serveArtifactFromOrchestrator(input: {
  stub: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
  artifactId: string;
}): Promise<Response> {
  return input.stub.fetch(`https://orchestrator.local/artifact/${encodeURIComponent(input.artifactId)}.js`);
}

async function readJson<T>(request: Request): Promise<T> {
  if (!request.body) {
    return {} as T;
  }

  return (await request.json()) as T;
}

function json(
  value: unknown,
  init: ResponseInit & { headers?: Headers } = {},
): Response {
  const headers = init.headers ?? noStoreJsonHeaders();

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  return Response.json(value, {
    ...init,
    headers,
  });
}

async function generatePromptArtifactSource<Env extends SuperobjectiveCloudflareEnv>(input: {
  env: Env;
  island: EditableIsland;
  intent: string;
  actor?: EditableActor;
  currentSourceTsx?: string;
}): Promise<string> {
  if (!input.env.AI) {
    throw new Error(
      "Prompt edits require a Cloudflare Workers AI binding named AI.",
    );
  }

  const model = stringEnv(input.env.SO_EDIT_MODEL, DEFAULT_EDIT_MODEL);
  const gatewayId = stringEnv(
    input.env.SO_AI_GATEWAY_ID,
    DEFAULT_AI_GATEWAY_ID,
  );
  const response = await input.env.AI.run(
    model,
    {
      messages: [
        {
          role: "system",
          content: createEditSystemPrompt(input.island),
        },
        {
          role: "user",
          content: createEditUserPrompt({
            intent: input.intent,
            island: input.island,
            currentSourceTsx: input.currentSourceTsx,
          }),
        },
      ],
      max_tokens: 1800,
      temperature: 0.2,
    },
    {
      gateway: {
        id: gatewayId,
        collectLog: true,
        metadata: {
          feature: "superobjective.editable-island.edit",
          islandId: input.island.id,
          actorId: input.actor?.id ?? "anonymous",
          intentHash: stableHash(input.intent),
        },
      },
    },
  );
  const text = responseText(response).trim();
  const sourceTsx = extractSourceTsx(text, input.island);

  if (!sourceTsx.includes("export default")) {
    throw new Error(
      `Workers AI edit response did not include a default export. Preview: ${text.slice(0, 500)}`,
    );
  }

  return sourceTsx;
}

function createEditSystemPrompt(island: EditableIsland): string {
  return [
    "You edit one React client artifact for a Superobjective editable island.",
    "Return only TypeScript/TSX source code for the requested file. Do not include markdown fences or commentary.",
    "The first line must be: import React from \"react\";",
    `The module must include: export default function Generated${toIdentifier(island.id)}Island() {`,
    "Use normal JSX and normal React component functions. Do not manually lower JSX to React.createElement.",
    "TypeScript annotations are allowed when they make the code clearer, but keep the artifact easy to read.",
    "Allowed imports are: react, react/jsx-runtime, @superobjective/tanstack-start.",
    "Do not use eval, new Function, direct fetch, cookies, localStorage, sessionStorage, script tags, secrets, or env access.",
    "Do not call mutation tools during render. Prefer static UI unless the prompt explicitly asks to read data.",
    "Keep the artifact self-contained, polished, responsive, and under 64 KB.",
    `Island id: ${island.id}.`,
    `Editable workspace entrypoint: ${generatedEntrypoint(island)}.`,
    `Available tool manifest: ${JSON.stringify(toToolManifest(island))}.`,
  ].join("\n");
}

function createEditUserPrompt(input: {
  intent: string;
  island: EditableIsland;
  currentSourceTsx?: string;
}): string {
  return [
    `User edit intent: ${input.intent.trim()}`,
    "",
    `Current ${generatedEntrypoint(input.island)} source:`,
    input.currentSourceTsx?.trim() || "(The trusted default renderer is active.)",
    "",
    `Use this component name: Generated${toIdentifier(input.island.id)}Island.`,
  ].join("\n");
}

function generatedEntrypoint(island: EditableIsland): string {
  return `src/Generated${toIdentifier(island.id)}Island.tsx`;
}

function sourceToWorkspaceFiles(input: {
  island: EditableIsland;
  sourceTsx?: string;
}): Record<string, string> | undefined {
  if (!input.sourceTsx) {
    return undefined;
  }

  return {
    [generatedEntrypoint(input.island)]: input.sourceTsx,
  };
}

function extractSourceTsx(text: string, island: EditableIsland): string {
  const fenced = text.match(/```(?:tsx|ts|jsx|js)?\s*([\s\S]*?)```/i)?.[1];
  const source = (fenced ?? text).trim();
  const importStart = source.search(/\bimport\s+React\b/);
  const normalized = importStart > 0 ? source.slice(importStart).trim() : source;

  if (
    !normalized.includes("export default") &&
    /^\(?\s*React\.createElement\(/.test(normalized)
  ) {
    return [
      'import React from "react";',
      "",
      `export default function Generated${toIdentifier(island.id)}Island() {`,
      "  return (",
      indent(normalized.replace(/;$/, ""), 4),
      "  );",
      "}",
      "",
    ].join("\n");
  }

  return normalized;
}

function indent(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function responseText(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }

  if (!response || typeof response !== "object") {
    throw new Error("Workers AI edit response was empty.");
  }

  const record = response as Record<string, unknown>;
  const candidates = [
    record.response,
    record.result,
    typeof record.result === "object" && record.result
      ? (record.result as Record<string, unknown>).response
      : undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  throw new Error("Workers AI edit response did not contain source text.");
}

function stringEnv(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toIdentifier(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_$]/g, " ");
  const pascal = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");

  return pascal || "Editable";
}
