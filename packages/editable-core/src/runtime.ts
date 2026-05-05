import { EditableFunctionRegistry } from "./registry.js";
import type { EditableIsland } from "./types.js";

export function createEditableRuntime(islands: EditableIsland[]) {
  const islandMap = new Map(islands.map((island) => [island.id, island]));
  const registry = new EditableFunctionRegistry(
    islands.flatMap((island) => island.tools),
  );

  return {
    islands: islandMap,
    tools: registry,
    getIsland(id: string): EditableIsland {
      const island = islandMap.get(id);

      if (!island) {
        throw new Error(`Unknown editable island "${id}".`);
      }

      return island;
    },
  };
}
