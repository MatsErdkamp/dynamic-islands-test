import type { EditableIsland } from "@superobjective/editable-core";

export type WorkerLike = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type WorkerStubLike = {
  getEntrypoint(name?: string, options?: unknown): WorkerLike;
};

export type WorkerLoaderDefinition = {
  compatibilityDate: string;
  mainModule: string;
  modules: Record<string, string>;
  bindings?: Record<string, unknown>;
  globalOutbound?: null | "internet" | WorkerLike;
};

export type WorkerLoader = {
  get(
    name: string,
    init: () => WorkerLoaderDefinition | Promise<WorkerLoaderDefinition>,
  ): WorkerStubLike | WorkerLike | Promise<WorkerStubLike | WorkerLike>;
};

export type AiGatewayOptions = {
  id: string;
  skipCache?: boolean;
  cacheTtl?: number;
  cacheKey?: string;
  collectLog?: boolean;
  metadata?: Record<string, unknown>;
};

export type AiBinding = {
  aiGatewayLogId?: string;
  run(
    model: string,
    input: Record<string, unknown>,
    options?: { gateway?: AiGatewayOptions },
  ): Promise<unknown>;
  gateway?: (id: string) => unknown;
};

export type DurableObjectIdLike = unknown;

export type DurableObjectStubLike = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type DurableObjectNamespaceLike = {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
};

export type SqlStatementResultLike<T = Record<string, unknown>> = {
  one(): T | undefined;
  toArray?(): T[];
};

export type DurableObjectSqlLike = {
  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): SqlStatementResultLike<T>;
};

export type DurableObjectStorageLike = {
  sql?: DurableObjectSqlLike;
};

export type DurableObjectStateLike = {
  storage?: DurableObjectStorageLike;
  acceptWebSocket?: (socket: WebSocket, tags?: string[]) => void;
};

export type SuperobjectiveCloudflareEnv = {
  SO_ORCHESTRATOR?: DurableObjectNamespaceLike;
  SO_LOADER?: WorkerLoader;
  AI?: AiBinding;
  SO_AI_GATEWAY_ID?: string;
  SO_EDIT_MODEL?: string;
  [key: string]: unknown;
};

export type OrchestratorRouteHint = {
  actorId: string;
  pageId: string;
  islandId?: string;
};

export type OrchestratorOptions<Env extends SuperobjectiveCloudflareEnv> = {
  islands: EditableIsland[];
  deriveActor?: (args: {
    request: Request;
    env: Env;
  }) => Promise<{ id: string; scopes?: string[] } | undefined> | {
    id: string;
    scopes?: string[];
  } | undefined;
  createExecutionContext?: (args: {
    request: Request;
    env: Env;
    actor?: { id: string; scopes?: string[] };
    islandId: string;
  }) => Promise<Record<string, unknown>> | Record<string, unknown>;
  artifactBasePath?: string;
  now?: () => Date;
};
