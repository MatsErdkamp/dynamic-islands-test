import { stableHash, type EditableBoot } from "@superobjective/editable-core";

export type DurableObjectIdLike = unknown;

export type DurableObjectStubLike = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type DurableObjectNamespaceLike = {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
};

export type CloudflareEditableAdapterOptions = {
  namespaceBinding?: string;
  actorId?: (request: Request) => string | Promise<string>;
  pageId?: (request: Request) => string | Promise<string>;
};

export type CloudflareEditableAdapterEnv = Record<
  string,
  unknown
> & {
  SO_ORCHESTRATOR?: DurableObjectNamespaceLike;
};

export function createCloudflareEditableAdapter(
  options: CloudflareEditableAdapterOptions = {},
) {
  const namespaceBinding = options.namespaceBinding ?? "SO_ORCHESTRATOR";

  async function resolveOrchestrator(input: {
    request: Request;
    env: CloudflareEditableAdapterEnv;
    islandId?: string;
  }): Promise<DurableObjectStubLike> {
    const namespace = input.env[namespaceBinding] as
      | DurableObjectNamespaceLike
      | undefined;

    if (!namespace) {
      throw new Error(`Missing Durable Object namespace binding ${namespaceBinding}.`);
    }

    const actorId =
      (await options.actorId?.(input.request)) ??
      input.request.headers.get("x-so-actor") ??
      "anonymous";
    const pageId =
      (await options.pageId?.(input.request)) ??
      new URL(input.request.url).pathname;
    const name = deriveOrchestratorName({
      actorId,
      pageId,
      islandId: input.islandId,
    });

    return namespace.get(namespace.idFromName(name));
  }

  async function boot(input: {
    request: Request;
    env: CloudflareEditableAdapterEnv;
    islandId: string;
    etag?: string;
  }): Promise<EditableBoot> {
    const stub = await resolveOrchestrator(input);
    const response = await stub.fetch("https://orchestrator.local/boot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        islandId: input.islandId,
        etag: input.etag,
      }),
    });

    if (response.status === 304) {
      throw new Error("Boot returned not_modified without a cached payload.");
    }

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = (await response.json()) as { payload: EditableBoot };

    return payload.payload;
  }

  async function handleSoRequest(input: {
    request: Request;
    env: CloudflareEditableAdapterEnv;
    islandId?: string;
  }): Promise<Response | undefined> {
    const url = new URL(input.request.url);

    if (!url.pathname.startsWith("/_so/")) {
      return undefined;
    }

    const stub = await resolveOrchestrator(input);
    const rewritten = rewriteSoUrl(url);

    return stub.fetch(new Request(rewritten, input.request));
  }

  return {
    resolveOrchestrator,
    boot,
    handleSoRequest,
  };
}

function rewriteSoUrl(url: URL): string {
  const artifactMatch = url.pathname.match(
    /^\/_so\/artifacts\/([^/]+)\/([^/]+)\.js$/,
  );

  if (artifactMatch?.[2]) {
    return `https://orchestrator.local/artifact/${artifactMatch[2]}.js`;
  }

  return `https://orchestrator.local/${url.pathname.replace(/^\/_so\//, "")}`;
}

function deriveOrchestratorName(input: {
  actorId: string;
  pageId: string;
  islandId?: string;
}): string {
  return [
    "so",
    stableHash({
      actorId: input.actorId,
      pageId: input.pageId,
      islandId: input.islandId,
    }).slice(1),
  ].join(":");
}
