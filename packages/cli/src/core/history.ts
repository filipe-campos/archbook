import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { UserError } from "../errors.js";
import { readTextIfExists, sha256, writeFileAtomic, writeJson } from "../io/fs.js";
import type { ProjectPaths } from "./project.js";

/** Operations snapshotted before they change the file; `undo` snapshots internally too. */
export const SNAPSHOT_OPERATIONS = ["generate", "sync", "add-flow", "explain", "format"] as const;

/** Operations that rewrite the whole document, so uncommitted edits are worth a warning. */
export const WARN_UNCOMMITTED_OPERATIONS: readonly string[] = ["generate", "sync"];

const OPERATION = /^[a-z][a-z0-9-]{0,40}$/;

const SnapshotFileSchema = z.object({
  archbookSnapshot: z.literal(1),
  id: z.string(),
  operation: z.string(),
  createdAt: z.string(),
  archbookVersion: z.string(),
  /** False when architecture.json did not exist; restoring such a snapshot deletes the file. */
  existed: z.boolean(),
  hash: z.string().nullable(),
  /** Exact bytes of architecture.json at snapshot time, or null when it did not exist. */
  content: z.string().nullable(),
});

type SnapshotFile = z.infer<typeof SnapshotFileSchema>;
export type Snapshot = Omit<SnapshotFile, "archbookSnapshot">;
export type SnapshotMeta = Omit<Snapshot, "content">;

function contentHash(content: string | undefined | null): string | null {
  return content == null ? null : sha256(content);
}

function timestampId(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}-` +
    pad(date.getUTCMilliseconds(), 3)
  );
}

function snapshotFile(paths: ProjectPaths, id: string) {
  return path.join(paths.history, `${id}.json`);
}

export function readSnapshot(paths: ProjectPaths, id: string): Snapshot {
  const unreadable = () => new UserError(`Snapshot "${id}" is missing or unreadable.`);
  const text = readTextIfExists(snapshotFile(paths, id));
  if (text === undefined) throw unreadable();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw unreadable();
  }
  const parsed = SnapshotFileSchema.safeParse(data);
  if (!parsed.success) throw unreadable();
  const { archbookSnapshot: _format, ...snapshot } = parsed.data;
  return snapshot;
}

/** Snapshots, newest first. Unreadable files are skipped. */
export function listSnapshots(paths: ProjectPaths): SnapshotMeta[] {
  let files: string[];
  try {
    files = readdirSync(paths.history).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  const snapshots: SnapshotMeta[] = [];
  for (const file of files) {
    try {
      const { content: _content, ...meta } = readSnapshot(paths, file.slice(0, -".json".length));
      snapshots.push(meta);
    } catch {
      // Not a snapshot (or corrupted): ignore rather than block history and undo.
    }
  }
  return snapshots.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
}

export interface CreateSnapshotOptions {
  operation: string;
  version: string;
  limit: number;
  now?: Date;
}

export interface CreateSnapshotResult {
  snapshot: SnapshotMeta;
  /** False when the newest snapshot already holds the current content, so none was written. */
  created: boolean;
  pruned: string[];
}

/** Saves the current architecture.json (or its absence) before an operation changes it. */
export function createSnapshot(
  paths: ProjectPaths,
  options: CreateSnapshotOptions,
): CreateSnapshotResult {
  if (!OPERATION.test(options.operation)) {
    throw new UserError(
      `Invalid operation name "${options.operation}". Use lowercase letters, digits and hyphens.`,
    );
  }
  const content = readTextIfExists(paths.architecture) ?? null;
  const hash = contentHash(content);
  const [latest] = listSnapshots(paths);
  if (latest && latest.hash === hash) return { snapshot: latest, created: false, pruned: [] };

  const now = options.now ?? new Date();
  const base = `${timestampId(now)}-${options.operation}`;
  mkdirSync(paths.history, { recursive: true });
  let id = base;
  for (let n = 2; readTextIfExists(snapshotFile(paths, id)) !== undefined; n++) id = `${base}-${n}`;

  const snapshot: Snapshot = {
    id,
    operation: options.operation,
    createdAt: now.toISOString(),
    archbookVersion: options.version,
    existed: content !== null,
    hash,
    content,
  };
  writeJson(snapshotFile(paths, id), { archbookSnapshot: 1, ...snapshot } satisfies SnapshotFile);
  const pruned = pruneSnapshots(paths, options.limit);
  const { content: _content, ...meta } = snapshot;
  return { snapshot: meta, created: true, pruned };
}

/** Deletes the oldest snapshots beyond `limit`. Returns the deleted ids. */
export function pruneSnapshots(paths: ProjectPaths, limit: number): string[] {
  const stale = listSnapshots(paths).slice(Math.max(1, limit));
  for (const snapshot of stale) rmSync(snapshotFile(paths, snapshot.id), { force: true });
  return stale.map((snapshot) => snapshot.id);
}

/** Finds a snapshot by exact id or unique prefix. */
export function resolveSnapshot(paths: ProjectPaths, idOrPrefix: string): SnapshotMeta {
  const all = listSnapshots(paths);
  const exact = all.find((snapshot) => snapshot.id === idOrPrefix);
  if (exact) return exact;
  const matches = all.filter((snapshot) => snapshot.id.startsWith(idOrPrefix));
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0)
    throw new UserError(
      `No snapshot matches "${idOrPrefix}". Run "archbook history" to list them.`,
    );
  throw new UserError(
    `"${idOrPrefix}" matches ${matches.length} snapshots; use more characters of the id.`,
  );
}

/** Puts architecture.json back exactly as it was in the snapshot. */
export function restoreSnapshot(paths: ProjectPaths, snapshot: Snapshot): void {
  if (snapshot.content === null) rmSync(paths.architecture, { force: true });
  else writeFileAtomic(paths.architecture, snapshot.content);
}

export interface UndoResult {
  restored: SnapshotMeta;
  /** Snapshot of the state before the undo, so the undo itself can be undone. */
  saved: SnapshotMeta;
  before: string | null;
  after: string | null;
}

/**
 * Restores the newest snapshot that differs from the current file (or `to`), after snapshotting
 * the current state. Running it twice in a row therefore toggles between the two versions.
 */
export function undo(
  paths: ProjectPaths,
  options: { to?: string; version: string; limit: number },
): UndoResult | undefined {
  const current = readTextIfExists(paths.architecture) ?? null;
  const currentHash = contentHash(current);
  const target = options.to
    ? resolveSnapshot(paths, options.to)
    : listSnapshots(paths).find((snapshot) => snapshot.hash !== currentHash);
  if (!target) return undefined;

  // Read before snapshotting: pruning could delete the target when it is the oldest.
  const snapshot = readSnapshot(paths, target.id);
  const { snapshot: saved } = createSnapshot(paths, {
    operation: "undo",
    version: options.version,
    limit: Math.max(options.limit, 2),
  });
  restoreSnapshot(paths, snapshot);
  return { restored: target, saved, before: current, after: snapshot.content };
}
