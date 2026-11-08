import { formatArchitecture, type ArchitectureInput } from "@archbook/schema";
import { readTextIfExists, writeFileAtomic } from "../io/fs.js";
import { createSnapshot } from "./history.js";
import type { ProjectPaths } from "./project.js";
import { validateProject, type ProjectValidation } from "./validation.js";

export type FormatResult =
  | { status: "invalid"; validation: ProjectValidation }
  | { status: "formatted" }
  | { status: "changed"; written: false }
  | { status: "changed"; written: true; snapshotted: boolean };

export interface FormatOptions {
  /** Only report whether the file would change. */
  check?: boolean;
  version: string;
  historyLimit: number;
}

/** Rewrites `file` in canonical form. Only documents that pass the schema are formatted. */
export function formatFile(
  paths: ProjectPaths,
  file: string,
  options: FormatOptions,
): FormatResult {
  const validation = validateProject(paths, file);
  const text = readTextIfExists(file);
  if (!validation.architecture || text === undefined) return { status: "invalid", validation };
  const formatted = formatArchitecture(JSON.parse(text) as ArchitectureInput);
  if (formatted === text) return { status: "formatted" };
  if (options.check) return { status: "changed", written: false };

  // Snapshots hold architecture.json only, so another file is rewritten without one.
  const snapshotted = file === paths.architecture;
  if (snapshotted) {
    createSnapshot(paths, {
      operation: "format",
      version: options.version,
      limit: options.historyLimit,
    });
  }
  writeFileAtomic(file, formatted);
  return { status: "changed", written: true, snapshotted };
}
