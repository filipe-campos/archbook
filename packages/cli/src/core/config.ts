import {
  DEFAULT_HISTORY_LIMIT,
  formatIssuePath,
  validateConfig,
  type ArchbookConfig,
} from "@archbook/schema";
import { UserError } from "../errors.js";
import { readTextIfExists } from "../io/fs.js";
import type { ProjectPaths } from "./project.js";

export function loadConfig(paths: ProjectPaths): ArchbookConfig | undefined {
  const text = readTextIfExists(paths.config);
  if (text === undefined) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new UserError(`archbook/config.json is not valid JSON: ${(error as Error).message}`);
  }
  const result = validateConfig(data);
  if (!result.config) {
    const issues = result.errors
      .map((issue) => `  ${formatIssuePath(issue.path)}: ${issue.message}`)
      .join("\n");
    throw new UserError(`archbook/config.json is invalid:\n${issues}`);
  }
  return result.config;
}

/** Snapshot retention from the config, tolerating a missing or broken config. */
export function historyLimit(paths: ProjectPaths): number {
  try {
    return loadConfig(paths)?.history.limit ?? DEFAULT_HISTORY_LIMIT;
  } catch {
    return DEFAULT_HISTORY_LIMIT;
  }
}
