import type { SuperobjectiveManifest } from "./vite-plugin.js";

export type AlchemyCloudflareModule = {
  Worker: (id: string, props: Record<string, unknown>) => unknown;
  DurableObjectNamespace?: (
    id: string,
    props: Record<string, unknown>,
  ) => unknown;
  DynamicWorkerLoader?: (bindingName: string) => unknown;
  Ai?: (bindingName: string) => unknown;
  AI?: (bindingName: string) => unknown;
  AiGateway?: (id: string, props: Record<string, unknown>) => unknown;
  AIGateway?: (id: string, props: Record<string, unknown>) => unknown;
};

export type SuperobjectiveAlchemyOptions = {
  appName: string;
  manifest: SuperobjectiveManifest;
  cloudflare: AlchemyCloudflareModule;
  workerName?: string;
  extraBindings?: Record<string, unknown>;
  compatibilityDate?: string;
  compatibilityFlags?: string[];
  adopt?: boolean;
};

export function createSuperobjectiveCloudflareResources(
  options: SuperobjectiveAlchemyOptions,
) {
  const DurableObjectNamespace = options.cloudflare.DurableObjectNamespace;
  const DynamicWorkerLoader = options.cloudflare.DynamicWorkerLoader;
  const AiBinding = options.cloudflare.Ai ?? options.cloudflare.AI;
  const AiGateway = options.cloudflare.AiGateway ?? options.cloudflare.AIGateway;

  const orchestrator = DurableObjectNamespace
    ? DurableObjectNamespace(options.manifest.orchestrator.className, {
        className: options.manifest.orchestrator.className,
      })
    : {
        type: "durable_object_namespace",
        className: options.manifest.orchestrator.className,
        sqlite: true,
      };

  const loader = DynamicWorkerLoader
    ? DynamicWorkerLoader(options.manifest.dynamicWorkerLoader.binding)
    : {
        type: "worker_loader",
      };
  const ai = AiBinding
    ? AiBinding(options.manifest.ai.binding)
    : {
        type: "ai",
      };

  AiGateway?.(options.manifest.ai.gatewayId, {
    name: options.manifest.ai.gatewayId,
  });

  return options.cloudflare.Worker("app", {
    name: options.workerName ?? options.appName,
    main: options.manifest.workerEntrypoint,
    compatibility: {
      date: options.compatibilityDate ?? "2026-05-04",
      flags: options.compatibilityFlags ?? ["nodejs_compat"],
    },
    adopt: options.adopt,
    bindings: {
      [options.manifest.orchestrator.binding]: orchestrator,
      // Alchemy v2 beta exposes Worker Loader as DynamicWorkerLoader.
      // Its Worker binding type has not caught up yet, so keep this structural.
      [options.manifest.dynamicWorkerLoader.binding]: loader,
      [options.manifest.ai.binding]: ai,
      SO_AI_GATEWAY_ID: options.manifest.ai.gatewayId,
      SO_EDIT_MODEL: options.manifest.ai.editModel,
      ...options.extraBindings,
    },
  });
}
