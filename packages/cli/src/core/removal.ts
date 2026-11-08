import { existsSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import path from "node:path";
import { backupFiles } from "../io/backup.js";
import { readTextIfExists, sha256, writeFileAtomic } from "../io/fs.js";
import { ASSET_PREFIX } from "./assets.js";
import { readManifest } from "./manifest.js";
import { ARCHBOOK_DIR, resolveInside, type ProjectPaths } from "./project.js";
import { removeAppendedText } from "./textBlock.js";

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

const exists = (root: string, file: string) => existsSync(resolveInside(root, file));
const isEdited = (root: string, file: string, hash: string) => {
  const text = readTextIfExists(resolveInside(root, file));
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
  const absolutes = plan.items.map((item) => resolveInside(root, item.path));
  const touched = plan.items
    .filter((item) => item.action !== "delete-dir-if-empty")
    .map((item) => item.path);
  result.backup = await backupFiles(root, touched, options.backupDir);

  for (const [index, item] of plan.items.entries()) {
    const absolute = absolutes[index]!;
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
