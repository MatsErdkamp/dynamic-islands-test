import { z } from "zod";

export const CallEditableFunctionInput = z.object({
  islandId: z.string(),
  name: z.string(),
  input: z.unknown().optional(),
  source: z
    .enum(["browser", "query", "codemode", "webmcp", "backend-mcp", "system"])
    .default("browser"),
  artifactId: z.string().optional(),
});

export type CallEditableFunctionInput = z.infer<typeof CallEditableFunctionInput>;

export type EditableServerFunctionContext = {
  orchestrator?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
  env?: Record<string, unknown>;
};

export async function callThroughOrchestrator(
  ctx: EditableServerFunctionContext,
  data: CallEditableFunctionInput,
): Promise<unknown> {
  if (!ctx.orchestrator) {
    throw new Error("callEditableFunction requires an orchestrator stub.");
  }

  const response = await ctx.orchestrator.fetch("https://orchestrator.local/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = (await response.json()) as { output?: unknown };

  return payload.output;
}

export function createEditableServerFunction(createServerFn?: () => {
  validator(schema: typeof CallEditableFunctionInput): {
    handler(
      handler: (args: {
        data: CallEditableFunctionInput;
        context: EditableServerFunctionContext;
      }) => Promise<unknown>,
    ): unknown;
  };
}) {
  if (!createServerFn) {
    return {
      schema: CallEditableFunctionInput,
      handler: (args: {
        data: unknown;
        context: EditableServerFunctionContext;
      }) =>
        callThroughOrchestrator(
          args.context,
          CallEditableFunctionInput.parse(args.data),
        ),
    };
  }

  return createServerFn()
    .validator(CallEditableFunctionInput)
    .handler(async ({ data, context }) =>
      callThroughOrchestrator(context, data),
    );
}
