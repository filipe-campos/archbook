import type { z } from "zod";
import { ArchitectureSchema, type Architecture } from "./architecture.js";
import { ArchbookConfigSchema, type ArchbookConfig } from "./config.js";
import { indexArchitecture } from "./indexing.js";
import { createIssue, type ValidationIssue } from "./issues.js";
import { RULES } from "./rules/index.js";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** The parsed document with defaults applied, present whenever the Zod schema passed. */
  architecture?: Architecture;
}

export type SourceEntry = { type: "file"; lineCount: number } | { type: "directory" };

/** Looks up project files so source references can be checked against the disk. */
export interface SourceFileIndex {
  lookup(relativePath: string): SourceEntry | undefined;
}

export interface ValidateOptions {
  /** When omitted, source paths and line ranges are not checked against the disk. */
  sourceFiles?: SourceFileIndex;
}

export function validateArchitecture(
  input: unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const parsed = ArchitectureSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: issuesFromZod(parsed.error), warnings: [] };

  const issues = semanticIssues(parsed.data, options);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, errors, warnings, architecture: parsed.data };
}

function semanticIssues(doc: Architecture, options: ValidateOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ctx = {
    doc,
    index: indexArchitecture(doc),
    options,
    report: (...args: Parameters<typeof createIssue>) => issues.push(createIssue(...args)),
  };
  for (const rule of RULES) rule(ctx);
  return issues;
}

/** Maps Zod issues to `schema` validation errors. */
export function issuesFromZod(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) =>
    createIssue(
      "schema",
      issue.path.filter(
        (part): part is string | number => typeof part === "string" || typeof part === "number",
      ),
      issue.message,
    ),
  );
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  /** The parsed config with defaults applied, present when valid. */
  config?: ArchbookConfig;
}

export function validateConfig(input: unknown): ConfigValidationResult {
  const parsed = ArchbookConfigSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: issuesFromZod(parsed.error) };
  return { valid: true, errors: [], config: parsed.data };
}

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; issue: ValidationIssue };

export function parseJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, issue: createIssue("invalid-json", [], `Invalid JSON: ${reason}`) };
  }
}

/** Parses and validates the raw text of an architecture.json file. */
export function validateArchitectureText(
  text: string,
  options: ValidateOptions = {},
): ValidationResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return { valid: false, errors: [parsed.issue], warnings: [] };
  return validateArchitecture(parsed.value, options);
}
