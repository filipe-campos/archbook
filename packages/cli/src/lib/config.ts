import {
  ArchbookConfigSchema,
  DEFAULT_HISTORY_LIMIT,
  formatIssuePath,
  type ArchbookConfig,
} from "@archbook/schema";
import { UserError } from "../errors.js";
import { readTextIfExists } from "./fs.js";
import type { ProjectPaths } from "./project.js";

export const CONFIG_SCHEMA_URL = "https://unpkg.com/archbook@0.1/schema/config.schema.json";
export const ARCHITECTURE_SCHEMA_URL =
  "https://unpkg.com/archbook@0.1/schema/architecture.schema.json";

export function loadConfig(paths: ProjectPaths): ArchbookConfig | undefined {
  const text = readTextIfExists(paths.config);
  if (text === undefined) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new UserError(`archbook/config.json is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = ArchbookConfigSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (issue) => `  ${formatIssuePath(issue.path as Array<string | number>)}: ${issue.message}`,
      )
      .join("\n");
    throw new UserError(`archbook/config.json is invalid:\n${issues}`);
  }
  return parsed.data;
}

/** Snapshot retention from the config, tolerating a missing or broken config. */
export function historyLimit(paths: ProjectPaths): number {
  try {
    return loadConfig(paths)?.history.limit ?? DEFAULT_HISTORY_LIMIT;
  } catch {
    return DEFAULT_HISTORY_LIMIT;
  }
}
