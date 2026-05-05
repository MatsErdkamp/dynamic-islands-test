import type { EditableFunctionManifest } from "@superobjective/editable-core";

type ModelContextLike = {
  registerTool?: (
    name: string,
    descriptor: {
      description?: string;
      input?: EditableFunctionManifest["input"];
      execute(input: unknown): Promise<unknown>;
    },
  ) => void | Promise<void>;
  tools?: {
    register?: ModelContextLike["registerTool"];
  };
};

export function registerWebMcpTools(input: {
  tools: EditableFunctionManifest[];
  callTool(name: string, input: unknown): Promise<unknown>;
  navigatorRef?: Navigator & { modelContext?: ModelContextLike };
}): void {
  const navigatorRef =
    input.navigatorRef ??
    (typeof navigator !== "undefined"
      ? (navigator as Navigator & { modelContext?: ModelContextLike })
      : undefined);
  const modelContext = navigatorRef?.modelContext;
  const register = modelContext?.registerTool ?? modelContext?.tools?.register;

  if (!register) {
    return;
  }

  for (const tool of input.tools) {
    try {
      void Promise.resolve(register.call(modelContext, tool.name, {
        description: tool.description,
        input: tool.input,
        execute: (toolInput: unknown) => input.callTool(tool.name, toolInput),
      })).catch(() => {
        // Native and polyfilled WebMCP/MCP-B descriptors are still moving targets.
        // Registration must never break the island runtime.
      });
    } catch {
      // Registration is opportunistic.
    }
  }
}
