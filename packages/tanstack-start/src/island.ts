import {
  createEditableIsland as createCoreEditableIsland,
  type EditableIsland,
  type EditableIslandDef,
} from "@superobjective/editable-core";
import { createEditableRoute, type EditableRouteOptions } from "./route.js";

export type TanStackEditableIsland = EditableIsland & {
  route(path: string, options?: EditableRouteOptions): ReturnType<typeof createEditableRoute>;
};

export function createEditableIsland(
  def: EditableIslandDef,
): TanStackEditableIsland {
  const island = createCoreEditableIsland(def);

  return Object.assign(island, {
    route(path: string, options?: EditableRouteOptions) {
      return createEditableRoute(island, path, options);
    },
  });
}
