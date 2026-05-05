import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createEditableFunction,
  createEditableIsland,
} from "@superobjective/editable-core";
import {
  createBootCookie,
  createOrchestratorDurableObject,
  parseBootCookie,
} from "../src/index.js";

const EchoInput = z.object({
  value: z.string(),
});

const echo = createEditableFunction({
  name: "echo",
  input: EchoInput,
  run: ({ input, ctx }) => ({
    value: input.value,
    env: Boolean(ctx.env),
  }),
});

const setFilter = createEditableFunction({
  name: "setFilter",
  input: z.object({ region: z.string() }),
  run: async ({ input, view }) => {
    await view.set("filter", input);

    return { ok: true };
  },
});

const island = createEditableIsland({
  id: "globe",
  tools: [echo, setFilter],
  default: () => null,
  defaultSourceTsx: `import React from "react";
export default function GeneratedGlobeIsland() {
  return React.createElement("div", null, "Trusted default source seed");
}`,
});

describe("@superobjective/cloudflare orchestrator", () => {
  it("boots default artifacts, caches boot, and supports etags", async () => {
    const Orchestrator = createOrchestratorDurableObject({
      islands: [island],
    });
    const orchestrator = new Orchestrator({}, {});

    const first = await orchestrator.fetch(jsonRequest("/boot", { islandId: "globe" }));
    const firstPayload = (await first.json()) as {
      status: string;
      source: string;
      etag: string;
      payload: { activeArtifact: { id: string; kind: string } };
    };

    expect(firstPayload.status).toBe("ok");
    expect(firstPayload.source).toBe("sqlite");
    expect(firstPayload.payload.activeArtifact).toMatchObject({
      id: "default",
      kind: "trusted-default",
    });

    const second = await orchestrator.fetch(jsonRequest("/boot", { islandId: "globe" }));
    const secondPayload = (await second.json()) as { source: string };

    expect(secondPayload.source).toBe("memory");

    const notModified = await orchestrator.fetch(
      jsonRequest("/boot", {
        islandId: "globe",
        etag: firstPayload.etag,
      }),
    );

    expect(notModified.status).toBe(304);
  });

  it("calls registered tools and persists view state mutations", async () => {
    const Orchestrator = createOrchestratorDurableObject({
      islands: [island],
    });
    const orchestrator = new Orchestrator({}, {});

    const echoResponse = await orchestrator.fetch(
      jsonRequest("/call", {
        islandId: "globe",
        name: "echo",
        input: { value: "hello" },
      }),
    );

    expect(await echoResponse.json()).toMatchObject({
      ok: true,
      output: { value: "hello", env: true },
    });

    await orchestrator.fetch(
      jsonRequest("/call", {
        islandId: "globe",
        name: "setFilter",
        input: { region: "europe" },
      }),
    );

    const boot = await orchestrator.fetch(jsonRequest("/boot", { islandId: "globe" }));
    const body = (await boot.json()) as {
      payload: { viewState: Record<string, unknown> };
    };

    expect(body.payload.viewState.filter).toEqual({ region: "europe" });
  });

  it("stores compiled artifacts through /edit and serves immutable JS", async () => {
    const Orchestrator = createOrchestratorDurableObject({
      islands: [island],
    });
    const orchestrator = new Orchestrator({}, {});

    const edit = await orchestrator.fetch(
      jsonRequest("/edit", {
        islandId: "globe",
        sourceTsx: `
          import React from "react";
          export default function Generated() {
            return <div>Edited globe</div>;
          }
        `,
      }),
    );
    const editBody = (await edit.json()) as {
      ok: true;
      artifact: { id: string; url: string };
      version: number;
    };

    expect(editBody.ok).toBe(true);
    expect(editBody.version).toBe(1);

    const boot = await orchestrator.fetch(jsonRequest("/boot", { islandId: "globe" }));
    const bootBody = (await boot.json()) as {
      payload: { activeArtifact: { id: string; url: string } };
    };

    expect(bootBody.payload.activeArtifact.id).toBe(editBody.artifact.id);
    expect(bootBody.payload.activeArtifact.url).toBe(editBody.artifact.url);

    const artifactResponse = await orchestrator.fetch(
      new Request(
        `https://orchestrator.local/artifact/${editBody.artifact.id}.js`,
      ),
    );

    expect(artifactResponse.status).toBe(200);
    expect(artifactResponse.headers.get("Cache-Control")).toContain(
      "immutable",
    );
    expect(await artifactResponse.text()).toContain("Edited globe");
  });

  it("generates prompt edits through Workers AI with AI Gateway", async () => {
    const aiCalls: Array<{
      model: string;
      input: Record<string, unknown>;
      options?: { gateway?: { id: string; collectLog?: boolean } };
    }> = [];
    const Orchestrator = createOrchestratorDurableObject({
      islands: [island],
      deriveActor: () => ({ id: "alice" }),
    });
    const orchestrator = new Orchestrator(
      {},
      {
        AI: {
          aiGatewayLogId: "log_123",
          async run(model, input, options) {
            aiCalls.push({ model, input, options });

            return {
              response: `
                import React from "react";
                export default function GeneratedGlobeIsland() {
                  return React.createElement("div", null, "AI edited globe");
                }
              `,
            };
          },
        },
        SO_AI_GATEWAY_ID: "test-gateway",
      },
    );

    const edit = await orchestrator.fetch(
      jsonRequest("/edit", {
        islandId: "globe",
        intent: "make the globe feel like a command center",
      }),
    );
    const editBody = (await edit.json()) as {
      ok: true;
      artifact: { id: string };
      aiGatewayLogId?: string;
    };

    expect(editBody.ok).toBe(true);
    expect(editBody.aiGatewayLogId).toBe("log_123");
    expect(aiCalls).toHaveLength(1);
    expect(aiCalls[0]?.model).toBe("@cf/qwen/qwen2.5-coder-32b-instruct");
    expect(aiCalls[0]?.options?.gateway).toMatchObject({
      id: "test-gateway",
      collectLog: true,
    });
    expect(
      JSON.stringify(aiCalls[0]?.input),
    ).toContain("Trusted default source seed");

    const artifactResponse = await orchestrator.fetch(
      new Request(
        `https://orchestrator.local/artifact/${editBody.artifact.id}.js`,
      ),
    );

    expect(await artifactResponse.text()).toContain("AI edited globe");
  });

  it("resets an island back to the trusted default artifact", async () => {
    const Orchestrator = createOrchestratorDurableObject({
      islands: [island],
    });
    const orchestrator = new Orchestrator({}, {});

    await orchestrator.fetch(
      jsonRequest("/edit", {
        islandId: "globe",
        sourceTsx: `
          import React from "react";
          export default function Generated() {
            return <div>Edited globe</div>;
          }
        `,
      }),
    );

    const reset = await orchestrator.fetch(
      jsonRequest("/reset", { islandId: "globe" }),
    );

    expect(reset.status).toBe(200);

    const boot = await orchestrator.fetch(jsonRequest("/boot", { islandId: "globe" }));
    const bootBody = (await boot.json()) as {
      payload: { activeArtifact: { id: string; kind: string } };
    };

    expect(bootBody.payload.activeArtifact).toMatchObject({
      id: "default",
      kind: "trusted-default",
    });
  });

  it("signs and verifies boot cookies", async () => {
    const cookie = await createBootCookie({
      pageId: "/globe",
      orchestratorName: "so:abc",
      version: 2,
      artifactId: "art_123",
      etag: "h123",
      secret: "secret",
    });
    const parsed = await parseBootCookie(cookie, "secret");

    expect(parsed).toMatchObject({
      versionTag: "v1",
      version: 2,
      artifactId: "art_123",
      etag: "h123",
      verified: true,
    });
  });
});

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`https://orchestrator.local${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
