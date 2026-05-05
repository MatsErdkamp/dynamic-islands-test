// @ts-nocheck
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import {
  createSuperobjectiveCloudflareResources,
  type SuperobjectiveManifest,
} from "@superobjective/tanstack-start";
import { GlobeIsland } from "./app/lib/globe";

const manifest: SuperobjectiveManifest = {
  version: 1,
  workerEntrypoint: "./app/server.ts",
  orchestrator: {
    className: "SuperobjectiveOrchestrator",
    binding: "SO_ORCHESTRATOR",
  },
  dynamicWorkerLoader: {
    binding: "SO_LOADER",
  },
  ai: {
    binding: "AI",
    gatewayId: "default",
    editModel: "@cf/qwen/qwen2.5-coder-32b-instruct",
  },
  islands: [
    {
      id: GlobeIsland.id,
      title: GlobeIsland.title,
      rendering: GlobeIsland.rendering,
      cache: GlobeIsland.cache,
      tools: GlobeIsland.manifest.tools,
    },
  ],
} as const;

export default Alchemy.Stack(
  "superobjective-tanstack-globe",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
Effect.gen(function* () {
    const worker = yield* (createSuperobjectiveCloudflareResources({
      appName: "superobjective-tanstack-globe",
      manifest,
      cloudflare: Cloudflare,
      workerName: "superobjective-tanstack-globe",
    }) as Effect.Effect<unknown, never, never>);
    const tunnelHostname = process.env.SO_TUNNEL_HOSTNAME;
    const tunnel =
      tunnelHostname && "Tunnel" in Cloudflare
        ? yield* ((Cloudflare as any).Tunnel("phone-preview", {
            ingress: [
              {
                hostname: tunnelHostname,
                service: "http://localhost:5173",
              },
              {
                service: "http_status:404",
              },
            ],
          }) as Effect.Effect<unknown, never, never>)
        : undefined;

    return { worker, tunnel };
  }),
);
