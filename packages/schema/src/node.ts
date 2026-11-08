import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  countLines,
  validateArchitecture as validateDocument,
  type SourceEntry,
  type SourceFileIndex,
  type ValidationResult,
} from "./validate.js";

/** Source file index backed by the file system, with per-path caching. */
export function createFileSystemIndex(projectRoot: string): SourceFileIndex {
  const cache = new Map<string, SourceEntry | undefined>();
  return {
    lookup(relativePath) {
      if (cache.has(relativePath)) return cache.get(relativePath);
      let entry: SourceEntry | undefined;
      try {
        const absolute = path.resolve(projectRoot, relativePath);
        const stats = statSync(absolute);
        if (stats.isDirectory()) entry = { type: "directory" };
        else if (stats.isFile()) {
          entry = { type: "file", lineCount: countLines(readFileSync(absolute, "utf8")) };
        }
      } catch {
        entry = undefined;
      }
      cache.set(relativePath, entry);
      return entry;
    },
  };
}

export interface NodeValidateOptions {
  /** Directory that source paths are relative to. */
  projectRoot: string;
}

/** Zod schema + semantic validation, including the on-disk checks for source references. */
export function validateArchitecture(
  input: unknown,
  { projectRoot }: NodeValidateOptions,
): ValidationResult {
  return validateDocument(input, { sourceFiles: createFileSystemIndex(projectRoot) });
}
