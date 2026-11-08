import { existsSync } from "node:fs";
import path from "node:path";

export interface ProjectPaths {
  root: string;
  dir: string;
  architecture: string;
  config: string;
  history: string;
  manifest: string;
  dist: string;
}

export const ARCHBOOK_DIR = "archbook";

export function projectPaths(root: string): ProjectPaths {
  const dir = path.join(root, ARCHBOOK_DIR);
  return {
    root,
    dir,
    architecture: path.join(dir, "architecture.json"),
    config: path.join(dir, "config.json"),
    history: path.join(dir, ".history"),
    manifest: path.join(dir, ".manifest.json"),
    dist: path.join(dir, "dist"),
  };
}

/**
 * Walks up from `start` to the nearest directory that already has Archbook files, so commands
 * work from any sub-folder. Falls back to `start`.
 */
export function findProjectRoot(start: string): string {
  let current = path.resolve(start);
  for (;;) {
    const dir = path.join(current, ARCHBOOK_DIR);
    if (
      ["config.json", "architecture.json", ".manifest.json"].some((f) =>
        existsSync(path.join(dir, f)),
      )
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

/** Path relative to the project root, with forward slashes, for messages and manifests. */
export function relativePath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/") || ".";
}
