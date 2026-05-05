import { toCodeModeSdkManifest } from "./manifest.js";
import type { EditableIsland } from "./types.js";

export function createCodeModeSystemPrompt(island: EditableIsland): string {
  const manifest = toCodeModeSdkManifest(island);

  return [
    `You are editing the "${island.id}" editable island.`,
    "Return a single React TSX module that exports a default component.",
    "Use editable data and mutations only through @superobjective/tanstack-start runtime hooks.",
    `Available tools: ${manifest.tools.map((tool) => tool.name).join(", ")}`,
  ].join("\n");
}
