import type { z } from "zod";
import { ArchitectureSchema, type ArchitectureInput } from "./architecture.js";

type Def = {
  type: string;
  innerType?: z.ZodType;
  element?: z.ZodType;
  shape?: Record<string, z.ZodType>;
};

const defOf = (schema: z.ZodType) => schema.def as unknown as Def;

function unwrap(schema: z.ZodType): z.ZodType {
  let current = schema;
  let def = defOf(current);
  while ((def.type === "optional" || def.type === "default") && def.innerType) {
    current = def.innerType;
    def = defOf(current);
  }
  return current;
}

/** Values that mean the same as an absent field. Fields of type `unknown` (payloads) are kept. */
function isEmpty(schema: z.ZodType, value: unknown): boolean {
  switch (defOf(unwrap(schema)).type) {
    case "array":
      return Array.isArray(value) && value.length === 0;
    case "string":
      return value === "";
    case "boolean":
      return value === false;
    default:
      return false;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function canonical(schema: z.ZodType, value: unknown): unknown {
  const def = defOf(unwrap(schema));
  if (def.type === "array" && def.element && Array.isArray(value)) {
    const element = def.element;
    return value.map((item) => canonical(element, item));
  }
  if (def.type !== "object" || !def.shape || !isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(def.shape)) {
    const item = value[key];
    if (item === undefined) continue;
    if (isEmpty(field, item) && field.safeParse(undefined).success) continue;
    result[key] = canonical(field, item);
  }
  // Unknown keys are schema errors, but formatting must not lose them.
  for (const [key, item] of Object.entries(value)) if (!(key in def.shape)) result[key] = item;
  return result;
}

/**
 * Canonical text of an architecture document: keys in schema order; empty arrays, empty strings
 * and `false` left out where the field is optional; 2-space indentation and a final newline.
 */
export function formatArchitecture(doc: ArchitectureInput): string {
  return `${JSON.stringify(canonical(ArchitectureSchema, doc), null, 2)}\n`;
}
