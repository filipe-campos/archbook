import { rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { formatArchitecture, type ArchitectureInput } from "@archbook/schema";
import { UserError } from "../errors.js";
import { readTextIfExists, writeFileAtomic } from "../io/fs.js";
import { relativePath, type ProjectPaths } from "./project.js";
import { validateDocument, type ProjectValidation } from "./validation.js";

// Elements are checked only for the fields the merge reads; the schema checks the result.
const ItemSchema = z.looseObject({ id: z.string().min(1) });
const EdgeSchema = z.looseObject({
  id: z.string().min(1),
  from: z.string(),
  to: z.string(),
  kind: z.string(),
});
const FlowSchema = z.looseObject({
  id: z.string().min(1),
  steps: z.array(z.looseObject({ edge: z.string() })),
});

/** Top-level fields a draft may set, e.g. `generatedAt` from the snapshot. */
const DOCUMENT_FIELDS = [
  "$schema",
  "version",
  "project",
  "audience",
  "language",
  "generatedAt",
  "generatedBy",
] as const;
const documentFields = Object.fromEntries(
  DOCUMENT_FIELDS.map((key) => [key, z.unknown().optional()]),
) as Record<(typeof DOCUMENT_FIELDS)[number], z.ZodOptional<z.ZodUnknown>>;

const StructureDraftSchema = z.strictObject({
  ...documentFields,
  groups: z.array(ItemSchema).default([]),
  nodes: z.array(ItemSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  notes: z.unknown().optional(),
});

const FlowDraftSchema = z.strictObject({
  ...documentFields,
  flow: FlowSchema,
  newNodes: z.array(ItemSchema).default([]),
  newEdges: z.array(EdgeSchema).default([]),
  notes: z.unknown().optional(),
});

const DocumentSchema = z.looseObject({
  groups: z.array(ItemSchema).default([]),
  nodes: z.array(ItemSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  flows: z.array(FlowSchema).default([]),
});

type Item = z.infer<typeof ItemSchema>;
type Edge = z.infer<typeof EdgeSchema>;
type MergeDocument = z.infer<typeof DocumentSchema>;

/** A scanner draft (`groups`, `nodes`, `edges`) or a flow-tracer draft (`flow`, `newNodes`, `newEdges`). */
export type Draft =
  | ({ type: "structure" } & z.infer<typeof StructureDraftSchema>)
  | ({ type: "flow" } & z.infer<typeof FlowDraftSchema>);

/** Fields the user curates by hand, carried over when the scanner redraws a node. */
const CURATED_NODE_FIELDS = ["owner", "links", "position"] as const;

type Collection = "groups" | "nodes" | "edges" | "flows";

export interface MergeReport {
  added: Record<Collection, string[]>;
  /** Ids the previous document had and a structure draft left out. */
  removed: Record<Exclude<Collection, "flows">, string[]>;
  /** Draft elements that already existed: `existing` is the id the document keeps. */
  reused: Array<{ type: "group" | "node" | "edge"; id: string; existing: string }>;
  /** Draft edges whose id was taken by a different edge. */
  renamed: Array<{ from: string; to: string }>;
  /** Flows replaced by the draft's flow of the same id. */
  replaced: string[];
  /** Nodes whose owner, links or position came from the previous document. */
  preserved: string[];
}

export interface MergeResult {
  document: Record<string, unknown>;
  report: MergeReport;
}

function emptyReport(): MergeReport {
  return {
    added: { groups: [], nodes: [], edges: [], flows: [] },
    removed: { groups: [], nodes: [], edges: [] },
    reused: [],
    renamed: [],
    replaced: [],
    preserved: [],
  };
}

const issueList = (error: z.ZodError) =>
  error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");

export function parseDraft(value: unknown): Draft {
  const isFlow = typeof value === "object" && value !== null && "flow" in value;
  const parsed = (isFlow ? FlowDraftSchema : StructureDraftSchema).safeParse(value);
  if (!parsed.success) throw new UserError(`Invalid draft: ${issueList(parsed.error)}.`);
  return isFlow
    ? { type: "flow", ...(parsed.data as z.infer<typeof FlowDraftSchema>) }
    : { type: "structure", ...(parsed.data as z.infer<typeof StructureDraftSchema>) };
}

function addItems(
  existing: Item[],
  incoming: Item[],
  type: "group" | "node",
  added: string[],
  report: MergeReport,
) {
  const ids = new Set(existing.map((item) => item.id));
  for (const item of incoming) {
    if (ids.has(item.id)) {
      report.reused.push({ type, id: item.id, existing: item.id });
      continue;
    }
    existing.push(item);
    ids.add(item.id);
    added.push(item.id);
  }
}

/** Adds edges, reusing one with the same endpoints and kind. Returns draft id to document id. */
function addEdges(edges: Edge[], incoming: Edge[], report: MergeReport): Map<string, string> {
  const ids = new Map<string, string>();
  for (const edge of incoming) {
    const same = edges.find(
      (e) => e.from === edge.from && e.to === edge.to && e.kind === edge.kind,
    );
    if (same) {
      ids.set(edge.id, same.id);
      report.reused.push({ type: "edge", id: edge.id, existing: same.id });
      continue;
    }
    const taken = (id: string) => edges.some((e) => e.id === id);
    let id = edge.id;
    for (let n = 2; taken(id); n++) id = `${edge.id}-${n}`;
    if (id !== edge.id) report.renamed.push({ from: edge.id, to: id });
    edges.push({ ...edge, id });
    ids.set(edge.id, id);
    report.added.edges.push(id);
  }
  return ids;
}

const missingFrom = (before: Item[], after: Item[]) => {
  const kept = new Set(after.map((item) => item.id));
  return before.filter((item) => !kept.has(item.id)).map((item) => item.id);
};

function replaceStructure(
  doc: MergeDocument,
  draft: Draft & { type: "structure" },
  report: MergeReport,
) {
  const previous = new Map(doc.nodes.map((node) => [node.id, node]));
  const nodes = draft.nodes.map((node) => {
    const before = previous.get(node.id);
    if (!before) return node;
    const curated = Object.fromEntries(
      CURATED_NODE_FIELDS.filter((key) => before[key] !== undefined).map((key) => [
        key,
        before[key],
      ]),
    );
    if (Object.keys(curated).length > 0) report.preserved.push(node.id);
    return { ...node, ...curated };
  });
  const collections = { groups: draft.groups, nodes, edges: draft.edges } as const;
  for (const key of ["groups", "nodes", "edges"] as const) {
    report.removed[key] = missingFrom(doc[key], collections[key]);
    report.added[key] = missingFrom(collections[key], doc[key]);
  }
  doc.groups = draft.groups;
  doc.nodes = nodes;
  doc.edges = draft.edges;
}

/**
 * Applies a draft to the document. With `replaceStructure`, a scanner draft's groups, nodes and
 * edges replace the document's; otherwise only new ids are added and edges are deduplicated.
 */
export function mergeDraft(
  current: unknown,
  draft: Draft,
  options: { replaceStructure?: boolean } = {},
): MergeResult {
  const parsed = DocumentSchema.safeParse(current ?? {});
  if (!parsed.success) {
    throw new UserError(`architecture.json cannot be merged into: ${issueList(parsed.error)}.`);
  }
  const doc = structuredClone(parsed.data);
  const report = emptyReport();
  for (const key of DOCUMENT_FIELDS) if (draft[key] !== undefined) doc[key] = draft[key];

  if (draft.type === "structure") {
    if (options.replaceStructure) replaceStructure(doc, draft, report);
    else {
      addItems(doc.groups, draft.groups, "group", report.added.groups, report);
      addItems(doc.nodes, draft.nodes, "node", report.added.nodes, report);
      addEdges(doc.edges, draft.edges, report);
    }
    return { document: doc, report };
  }

  if (options.replaceStructure) {
    throw new UserError("--replace-structure takes a scanner draft, not a flow draft.");
  }
  addItems(doc.nodes, draft.newNodes, "node", report.added.nodes, report);
  const edgeIds = addEdges(doc.edges, draft.newEdges, report);
  const flow = {
    ...draft.flow,
    steps: draft.flow.steps.map((step) => ({ ...step, edge: edgeIds.get(step.edge) ?? step.edge })),
  };
  const index = doc.flows.findIndex((f) => f.id === flow.id);
  if (index === -1) {
    doc.flows.push(flow);
    report.added.flows.push(flow.id);
  } else {
    doc.flows[index] = flow;
    report.replaced.push(flow.id);
  }
  return { document: doc, report };
}

export interface ApplyDraftResult {
  /** False when the merged document fails the schema; then nothing is written and the draft stays. */
  written: boolean;
  draft: string;
  report: MergeReport;
  validation: ProjectValidation;
}

function readJsonFile(file: string, what: string): unknown {
  const text = readTextIfExists(file);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UserError(`${what} is not valid JSON: ${reason}`);
  }
}

/** Merges a draft from `archbook/.drafts/` into architecture.json, then deletes the draft. */
export function applyDraft(
  paths: ProjectPaths,
  draftFile: string,
  options: { replaceStructure?: boolean } = {},
): ApplyDraftResult {
  const draftPath = relativePath(paths.root, draftFile);
  const inside = path.relative(paths.drafts, draftFile);
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) {
    throw new UserError(
      `Drafts must be inside ${relativePath(paths.root, paths.drafts)}/, got ${draftPath}.`,
    );
  }
  const draftValue = readJsonFile(draftFile, draftPath);
  if (draftValue === undefined) throw new UserError(`Draft ${draftPath} does not exist.`);
  const draft = parseDraft(draftValue);
  const current = readJsonFile(paths.architecture, relativePath(paths.root, paths.architecture));

  const { document, report } = mergeDraft(current, draft, options);
  const validation = validateDocument(paths, document);
  if (!validation.architecture) return { written: false, draft: draftPath, report, validation };
  writeFileAtomic(paths.architecture, formatArchitecture(document as ArchitectureInput));
  rmSync(draftFile, { force: true });
  return { written: true, draft: draftPath, report, validation };
}
