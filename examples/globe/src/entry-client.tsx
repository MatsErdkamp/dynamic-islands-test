import { EditableIslandShell, readInlineBoot } from "@superobjective/tanstack-start";
import { hydrateRoot } from "react-dom/client";
import { GlobeIsland } from "./globe.js";

const boot = readInlineBoot();
const root = document.getElementById("root");

if (!boot) {
  throw new Error("Missing Superobjective boot payload.");
}

if (!root) {
  throw new Error("Missing root element.");
}

hydrateRoot(root, <EditableIslandShell island={GlobeIsland} boot={boot} inlineBoot={false} />);
