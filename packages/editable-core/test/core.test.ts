import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  EditableFunctionRegistry,
  createEditableFunction,
  createEditableIsland,
  createMemoryEditableViewState,
  toCodeModeSdkManifest,
  toToolManifest,
  validateEditableArtifact,
} from "../src/index.js";

describe("@superobjective/editable-core", () => {
  it("creates stable function manifests and validates input", async () => {
    const input = z.object({
      limit: z.number().default(10),
    });
    const getItems = createEditableFunction({
      name: "getItems",
      description: "Get items.",
      input,
      run: ({ input: parsed }) => ({ limit: parsed.limit }),
    });

    expect(getItems.manifest).toMatchObject({
      kind: "editable-function",
      name: "getItems",
      description: "Get items.",
    });
    expect(getItems.manifest.hash).toMatch(/^h[0-9a-f]+$/);
    expect(getItems.parseInput({})).toEqual({ limit: 10 });

    expect(() => getItems.parseInput({ limit: "bad" })).toThrow();
  });

  it("passes ctx, view, and meta into tool runs", async () => {
    const setFilter = createEditableFunction({
      name: "setFilter",
      input: z.object({ region: z.string() }),
      run: async ({ input, ctx, view, meta }) => {
        await view.set("filter", input);

        return {
          actorId: ctx.actor?.id,
          source: meta.source,
        };
      },
    });
    const registry = new EditableFunctionRegistry([setFilter]);
    const view = createMemoryEditableViewState();
    const output = await registry.call("setFilter", { region: "europe" }, {
      ctx: { actor: { id: "user_1" } },
      view,
      meta: { source: "browser" },
    });

    expect(output).toEqual({ actorId: "user_1", source: "browser" });
    expect(view.state.filter).toEqual({ region: "europe" });
  });

  it("creates island manifests with tool manifests and a default artifact", () => {
    const tool = createEditableFunction({
      name: "ping",
      run: () => "pong",
    });
    const island = createEditableIsland({
      id: "globe",
      tools: [tool],
      default: () => null,
      defaultSourceTsx: `import React from "react";
export default function DefaultGlobe() {
  return React.createElement("div", null, "Default globe");
}`,
    });

    expect(island.defaultArtifact).toMatchObject({
      id: "default",
      islandId: "globe",
      kind: "trusted-default",
      status: "active",
      sourceTsx: expect.stringContaining("Default globe"),
    });
    expect(island.defaultSourceTsx).toContain("Default globe");
    expect(toToolManifest(island).map((item) => item.name)).toEqual(["ping"]);
    expect(toCodeModeSdkManifest(island).imports).toContain(
      "useEditableFunction",
    );
  });

  it("rejects invalid generated artifacts", () => {
    expect(
      validateEditableArtifact(`
        import fs from "node:fs";
        export default function Bad() {
          fetch("/secret");
          eval("1 + 1");
          return <script />;
        }
      `).issues.map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining([
        "disallowed_import",
        "direct_fetch",
        "eval",
        "raw_script",
      ]),
    );

    expect(
      validateEditableArtifact("x".repeat(20), { maxBytes: 10 }).issues[0]
        ?.code,
    ).toBe("bundle_size");
  });
});
