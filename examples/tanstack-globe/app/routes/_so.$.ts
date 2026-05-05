// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { editableAdapter } from "../lib/superobjective.server";
import { GlobeIsland } from "../lib/globe";

export const Route = createFileRoute("/_so/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});

async function handle({ request }: { request: Request }) {
  const env = await getCloudflareEnv();
  const response = await editableAdapter.handleSoRequest({
    request,
    env,
    islandId: GlobeIsland.id,
  });

  return response ?? new Response("Not found", { status: 404 });
}

async function getCloudflareEnv(): Promise<Record<string, unknown>> {
  const mod = await import("cloudflare:workers");
  return mod.env as Record<string, unknown>;
}
