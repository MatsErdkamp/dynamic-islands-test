import {
  toMcpToolDescriptors,
  type EditableIsland,
} from "@superobjective/editable-core";

export function createEditableMcpServerManifest(islands: EditableIsland[]) {
  return {
    name: "superobjective-editable-islands",
    tools: islands.flatMap((island) =>
      toMcpToolDescriptors(island).map((tool) => ({
        ...tool,
        islandId: island.id,
      })),
    ),
  };
}
