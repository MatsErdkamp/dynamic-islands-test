import { stableHash } from "./stable.js";
import type {
  EditableFunction,
  EditableFunctionManifest,
  EditableIsland,
  EditableIslandManifest,
} from "./types.js";

export function toToolManifest(
  tools: EditableFunction<any, any>[] | EditableIsland,
): EditableFunctionManifest[] {
  const functionList = Array.isArray(tools) ? tools : tools.tools;

  return functionList
    .map((tool) => tool.manifest)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function toCodeModeSdkManifest(island: EditableIsland): {
  island: EditableIslandManifest;
  tools: EditableFunctionManifest[];
  imports: string[];
} {
  return {
    island: island.manifest,
    tools: toToolManifest(island),
    imports: [
      "useEditableFunction",
      "useEditableView",
      "useEditableToolManifest",
    ],
  };
}

export function createIslandManifestInput(island: {
  id: string;
  title?: string;
  rendering: EditableIsland["rendering"];
  cache: EditableIsland["cache"];
  tools: EditableFunction<any, any>[];
}): Omit<EditableIslandManifest, "hash"> {
  return {
    kind: "editable-island",
    id: island.id,
    title: island.title,
    tools: toToolManifest(island.tools),
    rendering: island.rendering,
    cache: island.cache,
  };
}

export function manifestHash(manifest: Omit<EditableIslandManifest, "hash">) {
  return stableHash(manifest);
}
