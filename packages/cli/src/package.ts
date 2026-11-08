import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This module sits one level below the package root both in src/ and in the dist/ bundle.
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const VERSION: string = (
  JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as { version: string }
).version;

export const GENERATED_BY = `archbook@${VERSION} + claude-code`;

/** First existing candidate: the copy bundled into the package, or the monorepo source. */
function locate(name: string, candidates: string[]): string {
  const found = candidates.map((c) => path.join(PACKAGE_ROOT, c)).find((c) => existsSync(c));
  if (!found) {
    throw new Error(
      `Archbook ${name} not found. Reinstall archbook, or run "pnpm build" in the repo.`,
    );
  }
  return found;
}

/** The built CLI entry point, for running this exact version from child processes. */
export const cliEntry = () => path.join(PACKAGE_ROOT, "dist", "index.js");

export const viewerDir = () => locate("viewer", ["viewer", "../viewer/dist"]);
export const pluginDir = () => locate("Claude Code assets", ["plugin", "../../plugin"]);
