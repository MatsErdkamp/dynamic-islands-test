import { schemaToManifest, parseWithSchema } from "./schema.js";
import { stableHash } from "./stable.js";
import type {
  EditableFunction,
  EditableFunctionDef,
  EditableFunctionManifest,
} from "./types.js";

const FUNCTION_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;

export function createEditableFunction<I, O>(
  def: EditableFunctionDef<I, O>,
): EditableFunction<I, O> {
  if (!FUNCTION_NAME_PATTERN.test(def.name)) {
    throw new Error(
      `Editable function name "${def.name}" must be identifier-like.`,
    );
  }

  const manifestInput = {
    kind: "editable-function" as const,
    name: def.name,
    description: def.description,
    input: schemaToManifest(def.input),
    output: schemaToManifest(def.output),
    cache: def.cache,
    permissions: def.permissions,
  };

  const manifest: EditableFunctionManifest = {
    ...manifestInput,
    hash: stableHash(manifestInput),
  };

  return {
    kind: "editable-function",
    name: def.name,
    description: def.description,
    input: def.input,
    output: def.output,
    cache: def.cache,
    permissions: def.permissions,
    manifest,
    run: def.run,
    parseInput(input: unknown): I {
      return parseWithSchema(def.input, input);
    },
    parseOutput(output: unknown): O {
      return parseWithSchema(def.output, output);
    },
  };
}
