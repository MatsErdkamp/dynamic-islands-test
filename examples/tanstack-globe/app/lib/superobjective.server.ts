import {
  createCloudflareEditableAdapter,
} from "@superobjective/tanstack-start";
import {
  createOrchestratorDurableObject,
  type SuperobjectiveCloudflareEnv,
} from "@superobjective/cloudflare";
import { getUserFromRequest } from "./auth";
import { GlobeIsland } from "./globe";

export type Env = SuperobjectiveCloudflareEnv;

export class SuperobjectiveOrchestrator extends createOrchestratorDurableObject<Env>(
  {
    islands: [GlobeIsland],
    deriveActor: ({ request }) => getUserFromRequest(request),
    createExecutionContext: ({ env }) => ({ env }),
  },
) {}

export const editableAdapter = createCloudflareEditableAdapter({
  actorId: (request) => getUserFromRequest(request).id,
  pageId: () => "/globe",
});
