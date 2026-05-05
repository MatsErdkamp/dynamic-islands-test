import { createDefaultArtifact } from "./artifact.js";
import {
  createIslandManifestInput,
  manifestHash,
} from "./manifest.js";
import type {
  EditableIsland,
  EditableIslandCacheOptions,
  EditableIslandDef,
  EditableIslandRenderingOptions,
  EditableRendererComponent,
} from "./types.js";

export function createEditableRenderer<P>(
  component: EditableRendererComponent<P>,
): EditableRendererComponent<P> {
  return component;
}

export function createEditableIsland(def: EditableIslandDef): EditableIsland {
  if (!/^[a-zA-Z0-9_-]+$/.test(def.id)) {
    throw new Error(
      `Editable island id "${def.id}" must contain only letters, numbers, underscores, and dashes.`,
    );
  }

  const duplicateTool = firstDuplicate(def.tools.map((tool) => tool.name));

  if (duplicateTool) {
    throw new Error(
      `Editable island "${def.id}" registered duplicate tool "${duplicateTool}".`,
    );
  }

  const rendering = withRenderingDefaults(def.rendering);
  const cache = withCacheDefaults(def.cache);
  const manifestInput = createIslandManifestInput({
    id: def.id,
    title: def.title,
    tools: def.tools,
    rendering,
    cache,
  });

  return {
    kind: "editable-island",
    id: def.id,
    title: def.title,
    tools: def.tools,
    default: def.default,
    defaultSourceTsx: def.defaultSourceTsx ?? "",
    rendering,
    cache,
    manifest: {
      ...manifestInput,
      hash: manifestHash(manifestInput),
    },
    defaultArtifact: createDefaultArtifact({
      islandId: def.id,
      sourceTsx: def.defaultSourceTsx,
    }),
  };
}

function withRenderingDefaults(
  rendering: EditableIslandRenderingOptions | undefined,
): Required<EditableIslandRenderingOptions> {
  return {
    editable: rendering?.editable ?? true,
    artifactStorage: rendering?.artifactStorage ?? "orchestrator-sqlite",
    generatedCodeIsolation:
      rendering?.generatedCodeIsolation ?? "dynamic-worker",
    defaultMode: rendering?.defaultMode ?? "client-jsx",
    generatedServerMode: rendering?.generatedServerMode ?? "cached-fragment",
  };
}

function withCacheDefaults(
  cache: EditableIslandCacheOptions | undefined,
): EditableIsland["cache"] {
  return {
    boot: {
      memoryTtl: cache?.boot?.memoryTtl ?? 5_000,
      browserPrivateMaxAge: cache?.boot?.browserPrivateMaxAge ?? 10,
      swr: cache?.boot?.swr ?? 60,
    },
    artifact: {
      immutable: cache?.artifact?.immutable ?? true,
    },
  };
}

function firstDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }

    seen.add(value);
  }

  return undefined;
}
