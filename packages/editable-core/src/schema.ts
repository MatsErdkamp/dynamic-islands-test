import type { EditableSchemaManifest, Schema } from "./types.js";

export function parseWithSchema<T>(
  schema: Schema<T> | undefined,
  value: unknown,
): T {
  if (!schema) {
    return value as T;
  }

  if (typeof schema.safeParse === "function") {
    const result = schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    throw new EditableSchemaError("Editable schema validation failed", {
      cause: result.error,
    });
  }

  if (typeof schema.parse === "function") {
    try {
      return schema.parse(value);
    } catch (error) {
      throw new EditableSchemaError("Editable schema validation failed", {
        cause: error,
      });
    }
  }

  return value as T;
}

export function schemaToManifest<T>(
  schema: Schema<T> | undefined,
): EditableSchemaManifest | undefined {
  if (!schema) {
    return undefined;
  }

  const details = schema as Record<string, unknown>;
  const def = details._def as Record<string, unknown> | undefined;
  const zod = details._zod as Record<string, unknown> | undefined;
  const vendor = def || zod ? "zod" : "structural";
  const summary =
    asString(def?.typeName) ??
    asString(def?.type) ??
    asString(zod?.def && (zod.def as Record<string, unknown>).type) ??
    schema.constructor?.name ??
    "schema";

  return {
    kind: "schema",
    vendor,
    description: schema.description,
    summary,
  };
}

export class EditableSchemaError extends Error {
  override name = "EditableSchemaError";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
