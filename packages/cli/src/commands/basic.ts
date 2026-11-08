import { spawn } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { diffArchitecture, summarizeDiff } from "@archbook/schema";
import { UserError } from "../errors.js";
import { historyLimit } from "../lib/config.js";
import { parseDocumentText, readTextIfExists } from "../lib/fs.js";
import { hasUncommittedChanges } from "../lib/git.js";
import {
  SNAPSHOT_OPERATIONS,
  WARN_UNCOMMITTED_OPERATIONS,
  createSnapshot,
  listSnapshots,
  readSnapshot,
  undo,
} from "../lib/history.js";
import { findProjectRoot, projectPaths, relativePath, type ProjectPaths } from "../lib/project.js";
import { startDevServer } from "../lib/server.js";
import { command, relativeTime, table } from "../lib/ui.js";
import { formatValidation, validateProject, validationJson } from "../lib/validation.js";
import { VERSION, viewerDir } from "../package.js";

export interface GlobalOptions {
  cwd: string;
}

export const resolvePaths = (options: GlobalOptions): ProjectPaths =>
  projectPaths(findProjectRoot(options.cwd));

const listInWords = (items: readonly string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export function validateCommand(
  options: GlobalOptions & { json?: boolean; file?: string },
): number {
  const paths = resolvePaths(options);
  const file = options.file ? path.resolve(options.cwd, options.file) : paths.architecture;
  const result = validateProject(paths, file);
  if (options.json) {
    console.log(JSON.stringify(validationJson(result), null, 2));
  } else {
    console.log(formatValidation(result));
    if (result.missing)
      console.log(
        pc.dim(
          `  Create it with ${command("archbook generate")}, or ${command("archbook init")} first.`,
        ),
      );
  }
  return result.valid ? 0 : 1;
}

/** Hidden: called by the Claude Code commands before they change architecture.json. */
export function snapshotCommand(options: GlobalOptions & { op: string }): number {
  const paths = resolvePaths(options);
  if (
    WARN_UNCOMMITTED_OPERATIONS.includes(options.op) &&
    hasUncommittedChanges(paths.root, paths.architecture)
  ) {
    console.warn(
      pc.yellow(
        `Warning: ${relativePath(paths.root, paths.architecture)} has uncommitted changes. A snapshot is saved anyway, so "archbook undo" can bring this version back.`,
      ),
    );
  }
  const { snapshot, created } = createSnapshot(paths, {
    operation: options.op,
    version: VERSION,
    limit: historyLimit(paths),
  });
  console.log(
    created
      ? `Snapshot ${snapshot.id} saved.`
      : `Snapshot ${snapshot.id} already holds the current architecture.json; nothing new to save.`,
  );
  console.log(`Time: ${isoNow()}`);
  return 0;
}

export function historyCommand(options: GlobalOptions & { json?: boolean }): number {
  const paths = resolvePaths(options);
  const snapshots = listSnapshots(paths);
  // Each snapshot holds the state before its operation; what the operation changed is the
  // difference to the next newer snapshot, or to the current file for the newest one.
  let newer = readTextIfExists(paths.architecture) ?? null;
  const entries = snapshots.map((meta) => {
    const content = readSnapshot(paths, meta.id).content;
    const summary = summarizeDiff(
      diffArchitecture(parseDocumentText(content), parseDocumentText(newer)),
    );
    newer = content;
    return { ...meta, changes: summary };
  });

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return 0;
  }
  if (entries.length === 0) {
    console.log(
      `No snapshots yet. They are saved automatically before ${listInWords(SNAPSHOT_OPERATIONS)}.`,
    );
    return 0;
  }
  const rows = [
    ["ID", "WHEN", "OPERATION", "CHANGES AFTER IT"].map((title) => pc.dim(title)),
    ...entries.map((entry) => [
      pc.cyan(entry.id),
      relativeTime(entry.createdAt),
      entry.operation,
      entry.changes,
    ]),
  ];
  console.log(table(rows));
  console.log(
    pc.dim(
      `\nRestore one with ${command("archbook undo --to <id>")}, or the latest with ${command("archbook undo")}.`,
    ),
  );
  return 0;
}

export function undoCommand(options: GlobalOptions & { to?: string }): number {
  const paths = resolvePaths(options);
  const result = undo(paths, { to: options.to, version: VERSION, limit: historyLimit(paths) });
  if (!result) {
    console.log("Nothing to undo: no snapshot differs from the current architecture.json.");
    return 0;
  }
  const file = relativePath(paths.root, paths.architecture);
  const summary = summarizeDiff(
    diffArchitecture(parseDocumentText(result.before), parseDocumentText(result.after)),
  );
  if (result.after === null) {
    console.log(
      `${pc.green("✔")} Removed ${file}: it did not exist before ${result.restored.operation}.`,
    );
  } else {
    console.log(
      `${pc.green("✔")} Restored ${file} from ${pc.cyan(result.restored.id)} (${result.restored.operation}, ${relativeTime(result.restored.createdAt)}).`,
    );
    console.log(`  Changes: ${summary}`);
  }
  console.log(
    pc.dim(
      `  Changed your mind? Run ${command("archbook undo")} again (the previous state was saved as ${result.saved.id}).`,
    ),
  );
  return 0;
}

export async function devCommand(
  options: GlobalOptions & { port: number; host?: string; open?: boolean },
): Promise<number> {
  const paths = resolvePaths(options);
  if (!existsSync(paths.dir)) {
    throw new UserError(
      `No archbook/ folder in ${paths.root}. Run ${command("archbook init")} first.`,
    );
  }
  const report = () => {
    const result = validateProject(paths);
    console.log(
      result.missing
        ? pc.yellow(`Waiting for ${result.file}... (run ${command("archbook generate")})`)
        : formatValidation(result),
    );
  };
  report();
  const server = await startDevServer({
    viewerDir: viewerDir(),
    architectureFile: paths.architecture,
    port: options.port,
    host: options.host,
    onChange: () => {
      console.log(
        pc.dim(`\n${new Date().toLocaleTimeString()} architecture.json changed, reloading`),
      );
      report();
    },
  });
  console.log(
    `\n  ${pc.bold("Archbook")} running at ${pc.cyan(server.url)}\n  ${pc.dim("Live reload is on. Press Ctrl+C to stop.")}\n`,
  );
  if (options.open) openBrowser(server.url);

  await new Promise<void>((resolve) => {
    const stop = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      void server.close().then(resolve);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  return 0;
}

function openBrowser(url: string) {
  const [bin, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(bin, args as string[], { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}

/** Marks a folder as produced by `archbook build`, so rebuilding may safely replace it. */
const BUILD_MARKER = ".archbook-build";

export function buildCommand(options: GlobalOptions & { out?: string }): number {
  const paths = resolvePaths(options);
  const result = validateProject(paths);
  if (!result.valid) {
    console.log(formatValidation(result));
    throw new UserError("Fix the errors above before building.");
  }
  const out = options.out ? path.resolve(options.cwd, options.out) : paths.dist;
  if (existsSync(out)) {
    const entries = readdirSync(out);
    if (entries.length > 0 && !entries.includes(BUILD_MARKER)) {
      throw new UserError(
        `${out} is not empty and was not created by "archbook build". Choose another --out folder.`,
      );
    }
    rmSync(out, { recursive: true, force: true });
  }
  cpSync(viewerDir(), out, { recursive: true });
  cpSync(paths.architecture, path.join(out, "architecture.json"));
  writeFileSync(path.join(out, BUILD_MARKER), `archbook@${VERSION}\n`);
  // Lets GitHub Pages serve the folder as-is.
  writeFileSync(path.join(out, ".nojekyll"), "");

  const shown = path.relative(process.cwd(), out) || ".";
  console.log(formatValidation(result));
  console.log(`${pc.green("✔")} Static site written to ${pc.cyan(shown)}`);
  console.log(
    pc.dim(
      `  Preview it with ${command(`npx serve ${shown}`)} or publish the folder to any static host.`,
    ),
  );
  return 0;
}
