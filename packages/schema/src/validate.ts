import type { z } from "zod";
import {
  ArchitectureSchema,
  type Architecture,
  type NodeKind,
  type SourceRef,
} from "./architecture.js";
import { ArchbookConfigSchema, type ArchbookConfig } from "./config.js";
import { suggest } from "./text.js";

export type IssueSeverity = "error" | "warning";

/** Every validation code with its severity. A code never changes severity between reports. */
export const ISSUE_CODES = {
  "invalid-json": { severity: "error", summary: "The file is not valid JSON." },
  schema: { severity: "error", summary: "The document does not match the schema." },
  "duplicate-id": { severity: "error", summary: "Two items in a collection share an id." },
  "unknown-node": { severity: "error", summary: "An edge's from or to is not a node id." },
  "unknown-group": {
    severity: "error",
    summary: "A node's group or a group's parent is not a group id.",
  },
  "group-cycle": { severity: "error", summary: "Group parents form a loop." },
  "unknown-edge": { severity: "error", summary: "A flow step's edge is not an edge id." },
  "invalid-source-path": {
    severity: "error",
    summary: "A source path is absolute, uses backslashes or leaves the project root.",
  },
  "source-not-found": { severity: "error", summary: "A source path does not exist." },
  "lines-out-of-range": {
    severity: "error",
    summary: "A line range ends past the file, or a directory has a line range.",
  },
  "isolated-node": { severity: "warning", summary: "A node has no edges." },
  "node-without-sources": {
    severity: "warning",
    summary: "A node that is not external or an actor has no sources.",
  },
  "discontinuous-flow": {
    severity: "warning",
    summary: "A non-async step starts at a node no earlier step reached.",
  },
} as const satisfies Record<string, { severity: IssueSeverity; summary: string }>;

export type IssueCode = keyof typeof ISSUE_CODES;

export type IssuePath = Array<string | number>;

export interface ValidationIssue {
  severity: IssueSeverity;
  code: IssueCode;
  message: string;
  path: IssuePath;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** The parsed document with defaults applied, present whenever the Zod schema passed. */
  architecture?: Architecture;
}

export type SourceEntry = { type: "file"; lineCount: number } | { type: "directory" };

/** Looks up project files so source references can be checked against the disk. */
export interface SourceFileIndex {
  lookup(relativePath: string): SourceEntry | undefined;
}

export interface ValidateOptions {
  /** When omitted, source paths and line ranges are not checked against the disk. */
  sourceFiles?: SourceFileIndex;
}

/** Node kinds that usually have no code of their own in the project. */
const SOURCELESS_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(["external", "actor"]);

export function validateArchitecture(
  input: unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const parsed = ArchitectureSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: issuesFromZod(parsed.error), warnings: [] };

  const issues = semanticIssues(parsed.data, options);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, errors, warnings, architecture: parsed.data };
}

/** Maps Zod issues to `schema` validation errors. */
export function issuesFromZod(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) =>
    createIssue(
      "schema",
      issue.path.filter(
        (part): part is string | number => typeof part === "string" || typeof part === "number",
      ),
      issue.message,
    ),
  );
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  /** The parsed config with defaults applied, present when valid. */
  config?: ArchbookConfig;
}

export function validateConfig(input: unknown): ConfigValidationResult {
  const parsed = ArchbookConfigSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: issuesFromZod(parsed.error) };
  return { valid: true, errors: [], config: parsed.data };
}

function createIssue(code: IssueCode, path: IssuePath, message: string): ValidationIssue {
  return { severity: ISSUE_CODES[code].severity, code, message, path };
}

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; issue: ValidationIssue };

export function parseJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, issue: createIssue("invalid-json", [], `Invalid JSON: ${reason}`) };
  }
}

/** Parses and validates the raw text of an architecture.json file. */
export function validateArchitectureText(
  text: string,
  options: ValidateOptions = {},
): ValidationResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return { valid: false, errors: [parsed.issue], warnings: [] };
  return validateArchitecture(parsed.value, options);
}

/** Formats an issue path as `nodes[2].sources[0].path`. */
export function formatIssuePath(path: IssuePath): string {
  let out = "";
  for (const part of path) {
    if (typeof part === "number") out += `[${part}]`;
    else out += out === "" ? part : `.${part}`;
  }
  return out === "" ? "(root)" : out;
}

export function countLines(text: string): number {
  if (text === "") return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  return text.endsWith("\n") ? lines - 1 : lines;
}

export type NormalizedPath = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Normalizes a project-relative path (`./a/../b` -> `b`) without touching the disk, so the same
 * rules apply in the browser and in Node.
 */
export function normalizeSourcePath(raw: string): NormalizedPath {
  if (raw.includes("\\")) return { ok: false, reason: "must use forward slashes" };
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
    return { ok: false, reason: "must be relative to the project root, not absolute" };
  }
  const segments: string[] = [];
  for (const segment of raw.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return { ok: false, reason: "points outside the project root" };
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return { ok: true, path: segments.length === 0 ? "." : segments.join("/") };
}

function semanticIssues(doc: Architecture, options: ValidateOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const report = (code: IssueCode, path: IssuePath, message: string) =>
    issues.push(createIssue(code, path, message));

  const collections = [
    ["groups", "group", doc.groups],
    ["nodes", "node", doc.nodes],
    ["edges", "edge", doc.edges],
    ["flows", "flow", doc.flows],
  ] as const;
  for (const [key, label, items] of collections) {
    const firstIndex = new Map<string, number>();
    items.forEach((item, index) => {
      const first = firstIndex.get(item.id);
      if (first === undefined) firstIndex.set(item.id, index);
      else {
        report(
          "duplicate-id",
          [key, index, "id"],
          `Duplicate ${label} id "${item.id}" (already used by ${key}[${first}]).`,
        );
      }
    });
  }

  const groupIds = doc.groups.map((group) => group.id);
  const nodeIds = doc.nodes.map((node) => node.id);
  const edgeIds = doc.edges.map((edge) => edge.id);
  const groupSet = new Set(groupIds);
  const nodeSet = new Set(nodeIds);

  const checkSources = (sources: SourceRef[], base: IssuePath) => {
    sources.forEach((source, index) => {
      const path = [...base, index];
      const normalized = normalizeSourcePath(source.path);
      if (!normalized.ok) {
        report(
          "invalid-source-path",
          [...path, "path"],
          `Source path "${source.path}" ${normalized.reason}.`,
        );
        return;
      }
      if (!options.sourceFiles) return;
      const entry = options.sourceFiles.lookup(normalized.path);
      if (!entry) {
        report(
          "source-not-found",
          [...path, "path"],
          `Source path "${source.path}" does not exist.`,
        );
        return;
      }
      if (!source.lines) return;
      const [start, end] = source.lines;
      if (entry.type === "directory") {
        report(
          "lines-out-of-range",
          [...path, "lines"],
          `Source "${source.path}" is a directory, so it cannot have a line range.`,
        );
      } else if (end > entry.lineCount) {
        report(
          "lines-out-of-range",
          [...path, "lines"],
          `Lines ${start}-${end} are outside "${source.path}", which has ${entry.lineCount} lines.`,
        );
      }
    });
  };

  const parentOf = new Map(doc.groups.map((group) => [group.id, group.parent]));
  doc.groups.forEach((group, index) => {
    if (group.parent === undefined) return;
    if (!groupSet.has(group.parent)) {
      report(
        "unknown-group",
        ["groups", index, "parent"],
        `Group "${group.id}" has unknown parent "${group.parent}".${suggest(group.parent, groupIds)}`,
      );
      return;
    }
    const visited = new Set<string>([group.id]);
    for (
      let current = parentOf.get(group.id);
      current !== undefined;
      current = parentOf.get(current)
    ) {
      if (visited.has(current)) {
        report(
          "group-cycle",
          ["groups", index, "parent"],
          `Group "${group.id}" is part of a parent cycle.`,
        );
        break;
      }
      visited.add(current);
    }
  });

  doc.nodes.forEach((node, index) => {
    if (node.group !== undefined && !groupSet.has(node.group)) {
      report(
        "unknown-group",
        ["nodes", index, "group"],
        `Node "${node.id}" references unknown group "${node.group}".${suggest(node.group, groupIds)}`,
      );
    }
    checkSources(node.sources, ["nodes", index, "sources"]);
  });

  doc.edges.forEach((edge, index) => {
    for (const end of ["from", "to"] as const) {
      if (!nodeSet.has(edge[end])) {
        report(
          "unknown-node",
          ["edges", index, end],
          `Edge "${edge.id}" ${end} unknown node "${edge[end]}".${suggest(edge[end], nodeIds)}`,
        );
      }
    }
    checkSources(edge.sources, ["edges", index, "sources"]);
  });

  const edgesById = new Map<string, Architecture["edges"][number]>();
  for (const edge of doc.edges) if (!edgesById.has(edge.id)) edgesById.set(edge.id, edge);

  doc.flows.forEach((flow, flowIndex) => {
    // A synchronous call returns to its caller implicitly, so a step may start from any node the
    // flow already reached, not only from the previous step's target.
    const reached = new Set<string>();
    flow.steps.forEach((step, stepIndex) => {
      const edge = edgesById.get(step.edge);
      if (!edge) {
        report(
          "unknown-edge",
          ["flows", flowIndex, "steps", stepIndex, "edge"],
          `Flow "${flow.id}" step ${stepIndex + 1} references unknown edge "${step.edge}".${suggest(step.edge, edgeIds)}`,
        );
        return;
      }
      const [from, to] = step.reverse ? [edge.to, edge.from] : [edge.from, edge.to];
      if (stepIndex > 0 && !step.async && reached.size > 0 && !reached.has(from)) {
        report(
          "discontinuous-flow",
          ["flows", flowIndex, "steps", stepIndex],
          `Flow "${flow.id}" step ${stepIndex + 1} ("${step.title}") starts at "${from}", which no earlier step reached. Add the missing step, or mark this step async.`,
        );
      }
      reached.add(from);
      reached.add(to);
    });
  });

  const connected = new Set(doc.edges.flatMap((edge) => [edge.from, edge.to]));
  doc.nodes.forEach((node, index) => {
    if (!connected.has(node.id)) {
      report("isolated-node", ["nodes", index], `Node "${node.id}" has no edges.`);
    }
    if (node.sources.length === 0 && !SOURCELESS_KINDS.has(node.kind)) {
      report(
        "node-without-sources",
        ["nodes", index, "sources"],
        `Node "${node.id}" (${node.kind}) has no sources. Point to the code or config that defines it.`,
      );
    }
  });

  return issues;
}
