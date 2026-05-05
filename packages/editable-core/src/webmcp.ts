import type { EditableFunctionManifest, EditableIsland } from "./types.js";

export type WebMcpToolRegistration = {
  name: string;
  description?: string;
  input?: EditableFunctionManifest["input"];
};

export function toWebMcpToolRegistrations(
  island: EditableIsland,
): WebMcpToolRegistration[] {
  return island.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input: tool.manifest.input,
  }));
}
