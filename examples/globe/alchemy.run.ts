// @ts-nocheck
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import {
  createSuperobjectiveCloudflareResources,
  type SuperobjectiveManifest,
} from "@superobjective/tanstack-start/cloudflare";
import { GlobeIsland } from "./src/globe";

const manifest: SuperobjectiveManifest = {
  version: 1,
  workerEntrypoint: "./src/worker.tsx",
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
  "default-demo",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const worker = yield* (createSuperobjectiveCloudflareResources({
      appName: "default-demo",
      workerName: "default-demo",
      manifest,
      cloudflare: Cloudflare,
      extraBindings: {
        FLIGHT_DATA: {
          type: "service",
          service: "flight-data",
        },
      },
    }) as Effect.Effect<unknown, never, never>);

    return { worker };
  }),
);
