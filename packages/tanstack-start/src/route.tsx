import type { EditableBoot, EditableIsland } from "@superobjective/editable-core";
import React from "react";
import { EditableIslandShell } from "./client-runtime.js";
import { createModulePreloads } from "./preload.js";

export type EditableRouteOptions = {
  loadBoot?: (args: { path: string; island: EditableIsland }) => Promise<EditableBoot>;
  prewarm?: (args: { path: string; island: EditableIsland }) => Promise<void>;
  runtimeHref?: string;
  callEndpoint?: string;
  staleTime?: number;
  gcTime?: number;
  preloadStaleTime?: number;
  staleReloadMode?: "background" | "sync";
};

export type EditableRouteObject = {
  path: string;
  staleTime: number;
  gcTime: number;
  preloadStaleTime: number;
  staleReloadMode: "background" | "sync";
  preload: () => Promise<void>;
  loader: () => Promise<{
    boot: EditableBoot;
    preloads: ReturnType<typeof createModulePreloads>;
  }>;
  component: (props: { boot: EditableBoot }) => React.ReactElement;
};

export function createEditableRoute(
  island: EditableIsland,
  path: string,
  options: EditableRouteOptions = {},
): EditableRouteObject {
  return {
    path,
    staleTime: options.staleTime ?? 10_000,
    gcTime: options.gcTime ?? 30 * 60_000,
    preloadStaleTime: options.preloadStaleTime ?? 30_000,
    staleReloadMode: options.staleReloadMode ?? "background",
    async preload() {
      await options.prewarm?.({ path, island });
    },
    async loader() {
      if (!options.loadBoot) {
        throw new Error(
          `Editable route "${path}" requires loadBoot to fetch OrchestratorDO /boot.`,
        );
      }

      const boot = await options.loadBoot({ path, island });

      return {
        boot,
        preloads: createModulePreloads(boot, {
          runtimeHref: options.runtimeHref,
        }),
      };
    },
    component({ boot }) {
      return (
        <EditableIslandShell
          island={island}
          boot={boot}
          callEndpoint={options.callEndpoint}
        />
      );
    },
  };
}
