import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EditableIslandProvider,
  EditableIslandShell,
  createEditableFileRoute,
  createEditableFunction,
  createEditableIsland,
  createInlineBootScript,
  createLegacyEditableRoute,
  createModulePreloads,
  useEditableFunction,
  type EditableBoot,
} from "../src/index.js";
import { superobjective } from "../src/plugin.js";

const echo = createEditableFunction({
  name: "echo",
  run: ({ input }) => input,
});

const island = createEditableIsland({
  id: "globe",
  tools: [echo],
  default: () => <div>Default globe</div>,
});

const boot: EditableBoot = {
  islandId: "globe",
  version: 0,
  etag: "hboot",
  activeArtifact: {
    id: "default",
    kind: "trusted-default",
    integrity: "hdefault",
  },
  viewState: {},
  tools: island.manifest.tools,
  cache: island.cache,
  updatedAt: new Date(0).toISOString(),
};

describe("@superobjective/tanstack-start", () => {
  it("adds route(path) with TanStack cache defaults", async () => {
    const route = createLegacyEditableRoute(island, "/globe", {
      loadBoot: async () => boot,
      runtimeHref: "/_so/runtime/editable-island-runtime.js",
    });
    const loaded = await route.loader();

    expect(route.path).toBe("/globe");
    expect(route.staleTime).toBe(10_000);
    expect(route.preloadStaleTime).toBe(30_000);
    expect(route.gcTime).toBe(30 * 60_000);
    expect(route.staleReloadMode).toBe("background");
    expect(loaded.boot).toBe(boot);
    expect(loaded.preloads).toEqual([
      {
        rel: "modulepreload",
        href: "/_so/runtime/editable-island-runtime.js",
      },
    ]);
  });

  it("creates editable file routes with a TanStack-like component option", () => {
    const route = createEditableFileRoute("/globe")({
      component: island,
    });

    expect(route.options.component).toBeTypeOf("function");
    expect(route.options.staleTime).toBe(10_000);
    expect(route.options.preloadStaleTime).toBe(30_000);
    expect(route.options.gcTime).toBe(30 * 60_000);
  });

  it("composes TanStack beforeLoad and loader options", async () => {
    const calls: string[] = [];
    const route = createEditableFileRoute("/globe")({
      component: island,
      loadBoot: async () => {
        calls.push("boot");

        return boot;
      },
      beforeLoad: async () => {
        calls.push("beforeLoad");

        return { user: "mat" };
      },
      loader: async () => {
        calls.push("loader");

        return { pageTitle: "Flights" };
      },
    });

    await expect(route.options.beforeLoad({})).resolves.toEqual({
      user: "mat",
    });
    await expect(route.options.loader({})).resolves.toMatchObject({
      editableBoot: boot,
      editablePreloads: [],
      pageTitle: "Flights",
    });
    expect(calls).toEqual(["beforeLoad", "loader", "boot"]);
  });

  it("inlines boot JSON and renders the trusted default shell", () => {
    expect(createInlineBootScript(boot)).toContain("__SO_BOOT__");
    expect(createModulePreloads({
      ...boot,
      activeArtifact: {
        id: "art_123",
        kind: "generated-client",
        url: "/_so/artifacts/globe/art_123.js",
        integrity: "hint",
      },
    })).toEqual([
      {
        rel: "modulepreload",
        href: "/_so/artifacts/globe/art_123.js",
        integrity: "hint",
      },
    ]);

    const html = renderToString(
      <EditableIslandShell island={island} boot={boot} />,
    );

    expect(html).toContain("Default globe");
    expect(html).toContain("data-so-island=\"globe\"");
    expect(html).toContain("__SO_BOOT__");
  });

  it("routes useEditableFunction.call through the runtime provider", async () => {
    let callEcho: ((input: string) => Promise<string>) | undefined;

    function Probe() {
      callEcho = useEditableFunction<string, string>("echo").call;

      return null;
    }

    renderToString(
      <EditableIslandProvider
        boot={boot}
        onToolCall={async (call) => call.input}
      >
        <Probe />
      </EditableIslandProvider>,
    );

    await expect(callEcho?.("hello")).resolves.toBe("hello");
  });

  it("injects defaultSourceTsx from the default component source", () => {
    const plugin = superobjective({ islands: [island] });
    const transformed = plugin.transform(
      `
        import { createEditableIsland, useEditableFunction } from "@superobjective/tanstack-start";

        function DefaultGlobe() {
          const echoFn = useEditableFunction(echo);

          return <GlobeRenderer value="ok" />;
        }

        function GlobeRenderer({ value }) {
          return <div>{value}</div>;
        }

        export const GlobeIsland = createEditableIsland({
          id: "globe",
          tools: [echo],
          default: DefaultGlobe,
        });
      `,
      "/app/lib/globe.tsx",
    );

    expect(transformed).toContain("defaultSourceTsx");
    expect(transformed).toContain("export default function GeneratedGlobeIsland");
    expect(transformed).toContain('useEditableFunction(\\"echo\\")');
    expect(transformed).toContain("function GlobeRenderer");
  });
});
