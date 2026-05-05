import {
  createOrchestratorDurableObject,
  type SuperobjectiveCloudflareEnv,
  type WorkerLoader,
} from "@superobjective/cloudflare";
import { GlobeIsland, type FlightDataBinding } from "./globe.js";

export type Env = SuperobjectiveCloudflareEnv & {
  SO_LOADER: WorkerLoader;
  FLIGHT_DATA?: FlightDataBinding;
};

export class SuperobjectiveOrchestrator extends createOrchestratorDurableObject<Env>(
  {
    islands: [GlobeIsland],
    deriveActor: ({ request }) => ({
      id: request.headers.get("x-so-actor") ?? "anonymous",
    }),
    createExecutionContext: ({ env }) => ({ env }),
  },
) {}
