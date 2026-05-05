import type { EditableFunctionManifest, EditableIsland } from "./types.js";

export type EditableMcpToolDescriptor = {
  name: string;
  description?: string;
  annotations?: {
    readOnlyHint?: boolean;
  };
  inputSchema?: EditableFunctionManifest["input"];
};

export function toMcpToolDescriptors(
  island: EditableIsland,
): EditableMcpToolDescriptor[] {
  return island.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    annotations: {
      readOnlyHint: tool.permissions?.readOnly ?? false,
    },
    inputSchema: tool.manifest.input,
  }));
}
