import { createEditableFileRoute } from "@superobjective/tanstack-start";
import { GlobeIsland } from "../lib/globe";

export const Route = createEditableFileRoute("/globe")({
  component: GlobeIsland,
});
