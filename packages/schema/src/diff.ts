import { plural } from "./text.js";

export const DIFF_COLLECTIONS = ["nodes", "edges", "flows", "groups"] as const;
export type DiffCollection = (typeof DIFF_COLLECTIONS)[number];

export interface ChangedItem {
  id: string;
  fields: string[];
}

export interface CollectionDiff {
  added: string[];
  removed: string[];
  changed: ChangedItem[];
}

export type DiffStatus = "created" | "deleted" | "modified" | "unchanged";

export interface ArchitectureDiff {
  status: DiffStatus;
  nodes: CollectionDiff;
  edges: CollectionDiff;
  flows: CollectionDiff;
  groups: CollectionDiff;
  /** Top-level fields outside the collections that changed, e.g. `project`. */
  metadata: string[];
}

/** Fields that change on every regeneration and carry no architectural meaning. */
const VOLATILE_FIELDS = new Set(["generatedAt", "generatedBy", "$schema"]);

/**
 * Semantic diff between two architecture documents. Accepts any JSON (or null for "file does not
 * exist"), so it also works on snapshots that never passed validation.
 */
export function diffArchitecture(before: unknown, after: unknown): ArchitectureDiff {
  const status: DiffStatus =
    before == null && after == null
      ? "unchanged"
      : before == null
        ? "created"
        : after == null
          ? "deleted"
          : "modified";

  const diff: ArchitectureDiff = {
    status,
    nodes: diffCollection(before, after, "nodes"),
    edges: diffCollection(before, after, "edges"),
    flows: diffCollection(before, after, "flows"),
    groups: diffCollection(before, after, "groups"),
    metadata: diffMetadata(before, after),
  };
  if (status === "modified" && !hasChanges(diff)) diff.status = "unchanged";
  return diff;
}

export function hasChanges(diff: ArchitectureDiff): boolean {
  return (
    diff.metadata.length > 0 ||
    DIFF_COLLECTIONS.some((key) => {
      const c = diff[key];
      return c.added.length + c.removed.length + c.changed.length > 0;
    })
  );
}

const SINGULAR: Record<DiffCollection, string> = {
  nodes: "node",
  edges: "edge",
  flows: "flow",
  groups: "group",
};

const countOf = (count: number, key: DiffCollection) => plural(count, SINGULAR[key], key);

/** One-line human summary, e.g. "+2 nodes, -1 flow, 3 nodes changed". */
export function summarizeDiff(diff: ArchitectureDiff): string {
  if (diff.status === "deleted") return "file deleted";
  if (diff.status === "unchanged") return "no changes";

  const parts: string[] = [];
  for (const key of DIFF_COLLECTIONS) {
    const c = diff[key];
    if (c.added.length) parts.push(`+${countOf(c.added.length, key)}`);
    if (c.removed.length) parts.push(`-${countOf(c.removed.length, key)}`);
  }
  for (const key of DIFF_COLLECTIONS) {
    const c = diff[key];
    if (c.changed.length) parts.push(`${countOf(c.changed.length, key)} changed`);
  }
  if (diff.metadata.length) parts.push(`${diff.metadata.join(", ")} changed`);

  const summary = parts.join(", ");
  return diff.status === "created" ? `file created (${summary || "empty"})` : summary;
}

type Item = Record<string, unknown> & { id: string };

function itemsOf(doc: unknown, key: DiffCollection): Map<string, Item> {
  const items = new Map<string, Item>();
  if (!isRecord(doc)) return items;
  const list = doc[key];
  if (!Array.isArray(list)) return items;
  for (const item of list) {
    if (isRecord(item) && typeof item.id === "string" && !items.has(item.id)) {
      items.set(item.id, item as Item);
    }
  }
  return items;
}

function diffCollection(before: unknown, after: unknown, key: DiffCollection): CollectionDiff {
  const a = itemsOf(before, key);
  const b = itemsOf(after, key);
  const result: CollectionDiff = { added: [], removed: [], changed: [] };
  for (const id of b.keys()) if (!a.has(id)) result.added.push(id);
  for (const [id, item] of a) {
    const next = b.get(id);
    if (!next) {
      result.removed.push(id);
      continue;
    }
    const fields = changedFields(item, next);
    if (fields.length) result.changed.push({ id, fields });
  }
  return result;
}

function diffMetadata(before: unknown, after: unknown): string[] {
  if (!isRecord(before) || !isRecord(after)) return [];
  const skip = new Set<string>([...DIFF_COLLECTIONS, ...VOLATILE_FIELDS]);
  return changedFields(before, after).filter((field) => !skip.has(field));
}

function changedFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((key) => stableStringify(a[key]) !== stableStringify(b[key])).sort();
}

/** JSON.stringify with sorted object keys, so key order does not count as a change. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
