import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import path from "node:path";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { ASSET_PREFIX, PLUGIN_NAME } from "../lib/assets.js";
import { backupFiles } from "../lib/backup.js";
import { readTextIfExists, sha256, writeFileAtomic } from "../lib/fs.js";
import { readManifest } from "../lib/manifest.js";
import { ARCHBOOK_DIR, relativePath, type ProjectPaths } from "../lib/project.js";
import { CancelledError, type Prompter } from "../lib/prompter.js";
import { removeAppendedText } from "../lib/textBlock.js";
import { UserError, bullet, command } from "../lib/ui.js";
import { resolvePaths, type GlobalOptions } from "./basic.js";

export type RemovalGroup = "docs" | "assets" | "changes";

export type RemovalItem =
  /** Delete a file or folder (recursively). `edited` files are only deleted after asking. */
  | { action: "delete"; path: string; group: RemovalGroup; edited: boolean }
  /** Put back the user's original content of a file Archbook overwrote. */
  | { action: "restore"; path: string; group: RemovalGroup; original: string; edited: boolean }
  /** Strip the text Archbook appended; delete the file if Archbook created it and it is now empty. */
  | {
      action: "revert-append";
      path: string;
      group: RemovalGroup;
      appended: string;
      createdFile: boolean;
    }
  /** Delete a folder Archbook created, only if nothing else is left in it. */
  | { action: "delete-dir-if-empty"; path: string; group: RemovalGroup };

export interface RemovalPlan {
  mode: "manifest" | "conservative";
  items: RemovalItem[];
}

const DOC_FILES = ["architecture.json", "dist"];
const TOOLING_FILES = ["config.json", ".history", ".manifest.json"];
const ASSET_DIRS = [".claude/commands", ".claude/agents", ".claude/skills"];

const exists = (root: string, file: string) => existsSync(path.join(root, file));
const isEdited = (root: string, file: string, hash: string) => {
  const text = readTextIfExists(path.join(root, file));
  return text !== undefined && sha256(text) !== hash;
};

/** Works out what to remove. Never includes anything outside the manifest (or the conservative set). */
export function planRemoval(
  paths: ProjectPaths,
  options: { keepDocs?: boolean } = {},
): RemovalPlan {
  const root = paths.root;
  const manifest = readManifest(paths);
  const items: RemovalItem[] = [];
  const archbookFiles = (names: string[]) =>
    names
      .map((name) => `${ARCHBOOK_DIR}/${name}`)
      .filter((file) => exists(root, file))
      .map((file): RemovalItem => ({ action: "delete", path: file, group: "docs", edited: false }));

  if (!manifest) {
    if (options.keepDocs) items.push(...archbookFiles(TOOLING_FILES));
    else if (exists(root, ARCHBOOK_DIR))
      items.push({ action: "delete", path: ARCHBOOK_DIR, group: "docs", edited: false });
    for (const dir of ASSET_DIRS) {
      let entries: string[];
      try {
        entries = readdirSync(path.join(root, dir));
      } catch {
        continue;
      }
      for (const entry of entries.filter((name) => name.startsWith(ASSET_PREFIX))) {
        items.push({ action: "delete", path: `${dir}/${entry}`, group: "assets", edited: false });
      }
    }
    return { mode: "conservative", items };
  }

  const createdArchbookDir = manifest.entries.some(
    (e) => e.change === "created-dir" && e.path === ARCHBOOK_DIR,
  );
  if (options.keepDocs) items.push(...archbookFiles(TOOLING_FILES));
  else if (createdArchbookDir)
    items.push({ action: "delete", path: ARCHBOOK_DIR, group: "docs", edited: false });
  else items.push(...archbookFiles([...DOC_FILES, ...TOOLING_FILES]));

  const directories: RemovalItem[] = [];
  for (const entry of manifest.entries) {
    const group: RemovalGroup = entry.path.startsWith(".claude/") ? "assets" : "changes";
    switch (entry.change) {
      case "created":
        if (exists(root, entry.path))
          items.push({
            action: "delete",
            path: entry.path,
            group,
            edited: isEdited(root, entry.path, entry.hash),
          });
        break;
      case "replaced":
        items.push({
          action: "restore",
          path: entry.path,
          group,
          original: entry.original,
          edited: isEdited(root, entry.path, entry.hash),
        });
        break;
      case "modified":
        if (exists(root, entry.path))
          items.push({
            action: "revert-append",
            path: entry.path,
            group: "changes",
            appended: entry.appended,
            createdFile: entry.createdFile,
          });
        break;
      case "created-dir":
        if (entry.path !== ARCHBOOK_DIR && exists(root, entry.path))
          directories.push({ action: "delete-dir-if-empty", path: entry.path, group });
        break;
    }
  }
  // Deepest folders first, so parents are empty by the time they are checked.
  directories.sort((a, b) => b.path.split("/").length - a.path.split("/").length);
  return { mode: "manifest", items: [...items, ...directories] };
}

const GROUP_TITLES: Record<RemovalGroup, string> = {
  docs: "Documentation",
  assets: "Claude Code assets",
  changes: "Changes to existing files",
};

export function describePlan(plan: RemovalPlan): string {
  const sections: string[] = [];
  for (const group of ["docs", "assets", "changes"] as const) {
    const items = plan.items.filter(
      (item) => item.group === group && item.action !== "delete-dir-if-empty",
    );
    if (items.length === 0) continue;
    // A skill is a folder of files: list it once, unless one of its files needs attention.
    const skillOf = (item: RemovalItem) =>
      item.action === "delete" && !item.edited
        ? /^\.claude\/skills\/[^/]+\//.exec(item.path)?.[0]
        : undefined;
    const counts = new Map<string, number>();
    for (const item of items) {
      const skill = skillOf(item);
      if (skill) counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
    const lines: string[] = [];
    for (const item of items) {
      const skill = skillOf(item);
      if (!skill) lines.push(describeItem(item));
      else if (counts.has(skill)) {
        const count = counts.get(skill)!;
        counts.delete(skill);
        lines.push(bullet(`${skill}${pc.dim(` (${count} file${count === 1 ? "" : "s"})`)}`));
      }
    }
    sections.push(`${pc.bold(GROUP_TITLES[group])}\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

function describeItem(item: RemovalItem): string {
  const note =
    item.action === "restore"
      ? " (restore your original version)"
      : item.action === "revert-append"
        ? ` (remove the ${item.appended.trim().split("\n").length} lines Archbook added)`
        : item.path === ARCHBOOK_DIR
          ? "/ (everything, including history and builds)"
          : "";
  const edited =
    "edited" in item && item.edited ? pc.yellow(" edited since install, will ask") : "";
  return bullet(`${item.path}${pc.dim(note)}${edited}`);
}

export interface RemovalResult {
  removed: string[];
  kept: string[];
  restored: string[];
  reverted: string[];
  warnings: string[];
  backup?: string;
}

/**
 * Applies the plan after backing up everything it touches. `confirmEdited` decides about files the
 * user changed after install; without it they are kept.
 */
export async function executeRemoval(
  paths: ProjectPaths,
  plan: RemovalPlan,
  options: { confirmEdited?: (file: string) => Promise<boolean>; backupDir?: string } = {},
): Promise<RemovalResult> {
  const root = paths.root;
  const result: RemovalResult = { removed: [], kept: [], restored: [], reverted: [], warnings: [] };
  const touched = plan.items
    .filter((item) => item.action !== "delete-dir-if-empty")
    .map((item) => item.path);
  result.backup = await backupFiles(root, touched, options.backupDir);

  for (const item of plan.items) {
    const absolute = path.join(root, item.path);
    if ((item.action === "delete" || item.action === "restore") && item.edited) {
      const proceed = (await options.confirmEdited?.(item.path)) ?? false;
      if (!proceed) {
        result.kept.push(item.path);
        continue;
      }
    }
    switch (item.action) {
      case "delete":
        rmSync(absolute, { recursive: true, force: true });
        result.removed.push(item.path);
        break;
      case "restore":
        writeFileAtomic(absolute, item.original);
        result.restored.push(item.path);
        break;
      case "revert-append": {
        const current = readTextIfExists(absolute);
        if (current === undefined) break;
        const { content, exact } = removeAppendedText(current, item.appended);
        if (!exact)
          result.warnings.push(
            `${item.path} was edited around Archbook's lines; removed them line by line.`,
          );
        if (item.createdFile && content.trim() === "") {
          rmSync(absolute, { force: true });
          result.removed.push(item.path);
        } else {
          writeFileAtomic(absolute, content);
          result.reverted.push(item.path);
        }
        break;
      }
      case "delete-dir-if-empty":
        try {
          if (readdirSync(absolute).length === 0) rmdirSync(absolute);
        } catch {
          // Already gone or not empty: leave it.
        }
        break;
    }
  }
  return result;
}

/** Returns `claude plugin uninstall ...` commands for installed Archbook plugins, if any. */
function pluginUninstallCommands(): string[] {
  const list = spawnSync("claude", ["plugin", "list", "--json"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (list.status !== 0) return [];
  try {
    const plugins = JSON.parse(list.stdout) as Array<{ id?: string; scope?: string }>;
    return plugins
      .filter((plugin) => plugin.id?.startsWith(`${PLUGIN_NAME}@`))
      .map(
        (plugin) =>
          `claude plugin uninstall ${plugin.id}${plugin.scope ? ` --scope ${plugin.scope}` : ""}`,
      );
  } catch {
    return [];
  }
}

export interface RemoveOptions extends GlobalOptions {
  keepDocs?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

export async function removeCommand(options: RemoveOptions, prompter: Prompter): Promise<number> {
  const paths = resolvePaths(options);
  const plan = planRemoval(paths, { keepDocs: options.keepDocs });
  clack.intro(pc.bgRed(pc.white(" archbook remove ")));

  if (plan.items.filter((item) => item.action !== "delete-dir-if-empty").length === 0) {
    clack.outro(`Nothing to remove in ${paths.root}.`);
    return 0;
  }
  if (plan.mode === "conservative") {
    clack.log.warn(
      "No archbook/.manifest.json found, so Archbook cannot tell exactly what it installed.\n" +
        `Only archbook/ and files starting with "${ASSET_PREFIX}" in .claude/ are removed. Edit .gitignore yourself if needed.`,
    );
  }
  clack.note(describePlan(plan), options.dryRun ? "Would remove" : "Will remove");
  if (options.dryRun) {
    clack.outro("Dry run: nothing was changed.");
    return 0;
  }

  // Without a manifest there is no way to tell user files apart, so a person must always confirm.
  const mustAsk = plan.mode === "conservative" || !options.yes;
  if (mustAsk) {
    if (!prompter.interactive) {
      throw new UserError(
        plan.mode === "conservative"
          ? "Without a manifest, removal needs an interactive confirmation. Run it in a terminal."
          : "Add --yes to confirm in a non-interactive shell.",
      );
    }
    if (!(await prompter.confirm({ message: "Remove these files?", initialValue: false })))
      throw new CancelledError();
  }

  const result = await executeRemoval(paths, plan, {
    confirmEdited:
      prompter.interactive && !options.yes
        ? (file) =>
            prompter.confirm({
              message: `${file} was edited after Archbook installed it. Delete it anyway?`,
              initialValue: false,
            })
        : undefined,
  });

  const summary = [
    result.removed.length ? `Removed ${result.removed.length} item(s).` : "",
    result.restored.length ? `Restored your original ${result.restored.join(", ")}.` : "",
    result.reverted.length ? `Removed Archbook's lines from ${result.reverted.join(", ")}.` : "",
  ].filter(Boolean);
  clack.log.success(summary.join("\n") || "Done.");
  if (result.kept.length) {
    clack.log.warn(
      `Kept files you edited:\n${result.kept.map(bullet).join("\n")}\nDelete them by hand if you no longer need them.`,
    );
  }
  for (const warning of result.warnings) clack.log.warn(warning);
  if (result.backup) clack.log.info(`Backup of everything removed: ${pc.cyan(result.backup)}`);
  if (options.keepDocs && exists(paths.root, `${ARCHBOOK_DIR}/architecture.json`)) {
    clack.log.info(
      `Kept ${relativePath(paths.root, paths.architecture)}; ${command("npx archbook dev")} and ${command("build")} still work.`,
    );
  }
  const uninstall = pluginUninstallCommands();
  if (uninstall.length) {
    clack.log.info(
      `The Archbook plugin is also installed in Claude Code. To remove it:\n${uninstall.map((c) => `  ${command(c)}`).join("\n")}`,
    );
  }
  clack.outro("Archbook removed.");
  return 0;
}
