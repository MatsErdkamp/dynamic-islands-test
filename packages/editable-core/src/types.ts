export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type Schema<T> = {
  parse?: (value: unknown) => T;
  safeParse?: (
    value: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: unknown };
  description?: string;
  _def?: unknown;
  _zod?: unknown;
};

export type EditableCallSource =
  | "browser"
  | "query"
  | "codemode"
  | "webmcp"
  | "backend-mcp"
  | "system";

export type EditableActor = {
  id: string;
  type?: string;
  scopes?: string[];
  [key: string]: unknown;
};

export type EditableExecutionContext = {
  env?: Record<string, unknown>;
  request?: Request;
  actor?: EditableActor;
  islandId?: string;
  [key: string]: unknown;
};

export type EditableViewState = {
  state: Record<string, unknown>;
  get<T = unknown>(key: string): T | undefined | Promise<T | undefined>;
  set(key: string, value: unknown): void | Promise<void>;
  toJSON?(): Record<string, unknown>;
};

export type EditableCallMeta = {
  id?: string;
  source: EditableCallSource;
  islandId?: string;
  artifactId?: string;
  requestId?: string;
  timestamp?: string;
  [key: string]: unknown;
};

export type EditableFunctionDef<I, O> = {
  name: string;
  description?: string;
  input?: Schema<I>;
  output?: Schema<O>;
  cache?: {
    staleTime?: number;
    swr?: boolean;
  };
  permissions?: {
    scopes?: string[];
    readOnly?: boolean;
  };
  run: (args: {
    input: I;
    ctx: EditableExecutionContext;
    view: EditableViewState;
    meta: EditableCallMeta;
  }) => Promise<O> | O;
};

export type EditableSchemaManifest = {
  kind: "schema";
  vendor: "zod" | "structural" | "unknown";
  description?: string;
  summary?: string;
};

export type EditableFunctionManifest = {
  kind: "editable-function";
  name: string;
  description?: string;
  input?: EditableSchemaManifest;
  output?: EditableSchemaManifest;
  cache?: EditableFunctionDef<unknown, unknown>["cache"];
  permissions?: EditableFunctionDef<unknown, unknown>["permissions"];
  hash: string;
};

export type EditableFunction<I = unknown, O = unknown> = {
  kind: "editable-function";
  name: string;
  description?: string;
  input?: Schema<I>;
  output?: Schema<O>;
  cache?: EditableFunctionDef<I, O>["cache"];
  permissions?: EditableFunctionDef<I, O>["permissions"];
  manifest: EditableFunctionManifest;
  run: EditableFunctionDef<I, O>["run"];
  parseInput(input: unknown): I;
  parseOutput(output: unknown): O;
};

export type EditableRendererComponent<P = Record<string, unknown>> = (
  props: P,
) => unknown;

export type EditableIslandRenderingOptions = {
  editable?: boolean;
  artifactStorage?: "orchestrator-sqlite";
  generatedCodeIsolation?: "dynamic-worker";
  defaultMode?: "client-jsx" | "server-fragment";
  generatedServerMode?: "none" | "cached-fragment" | "live-isolated";
};

export type EditableIslandCacheOptions = {
  boot?: {
    memoryTtl?: number;
    browserPrivateMaxAge?: number;
    swr?: number;
  };
  artifact?: {
    immutable?: boolean;
  };
};

export type EditableIslandDef = {
  id: string;
  title?: string;
  tools: EditableFunction<any, any>[];
  default: EditableRendererComponent;
  defaultSourceTsx?: string;
  rendering?: EditableIslandRenderingOptions;
  cache?: EditableIslandCacheOptions;
};

export type EditableIslandManifest = {
  kind: "editable-island";
  id: string;
  title?: string;
  tools: EditableFunctionManifest[];
  rendering: Required<EditableIslandRenderingOptions>;
  cache: {
    boot: Required<NonNullable<EditableIslandCacheOptions["boot"]>>;
    artifact: Required<NonNullable<EditableIslandCacheOptions["artifact"]>>;
  };
  hash: string;
};

export type EditableArtifactKind =
  | "trusted-default"
  | "generated-client"
  | "generated-server-fragment";

export type EditableArtifactStatus =
  | "draft"
  | "validating"
  | "active"
  | "rejected";

export type EditableArtifact = {
  id: string;
  islandId: string;
  kind: EditableArtifactKind;
  sourceTsx: string;
  compiledClientJs?: string;
  compiledServerJs?: string;
  compiledCss?: string;
  integrity: string;
  status: EditableArtifactStatus;
  createdAt: string;
};

export type EditableArtifactDraft = {
  id?: string;
  islandId: string;
  kind?: EditableArtifactKind;
  sourceTsx: string;
  files?: Record<string, string>;
  entrypoint?: string;
};

export type EditableArtifactRef = {
  id: string;
  kind: EditableArtifactKind;
  url?: string;
  integrity: string;
};

export type EditableBoot = {
  islandId: string;
  version: number;
  etag: string;
  activeArtifact: EditableArtifactRef;
  viewState: Record<string, unknown>;
  tools: EditableFunctionManifest[];
  cache: Required<EditableIslandCacheOptions> & {
    boot: Required<NonNullable<EditableIslandCacheOptions["boot"]>>;
    artifact: Required<NonNullable<EditableIslandCacheOptions["artifact"]>>;
  };
  updatedAt: string;
};

export type EditableIsland = {
  kind: "editable-island";
  id: string;
  title?: string;
  tools: EditableFunction<any, any>[];
  default: EditableRendererComponent;
  defaultSourceTsx: string;
  rendering: Required<EditableIslandRenderingOptions>;
  cache: EditableBoot["cache"];
  manifest: EditableIslandManifest;
  defaultArtifact: EditableArtifact;
};

export type EditableArtifactValidationIssue = {
  code:
    | "disallowed_import"
    | "eval"
    | "direct_fetch"
    | "browser_storage"
    | "raw_script"
    | "env_access"
    | "render_mutation"
    | "bundle_size"
    | "missing_runtime_import";
  message: string;
  line?: number;
  detail?: Record<string, unknown>;
};

export type EditableArtifactValidationResult = {
  ok: boolean;
  issues: EditableArtifactValidationIssue[];
  imports: string[];
  byteLength: number;
};

export type CompiledEditableArtifact = EditableArtifact & {
  validation: EditableArtifactValidationResult;
};
