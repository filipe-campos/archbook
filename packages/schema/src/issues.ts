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
  "self-loop-edge": { severity: "warning", summary: "An edge goes from a node to itself." },
  "duplicate-edge": {
    severity: "warning",
    summary: "An edge repeats the from, to and kind of an earlier edge.",
  },
  "empty-group": { severity: "warning", summary: "A group holds no nodes at any depth." },
} as const satisfies Record<string, { severity: IssueSeverity; summary: string }>;

export type IssueCode = keyof typeof ISSUE_CODES;

export type IssuePath = Array<string | number>;

export interface ValidationIssue {
  severity: IssueSeverity;
  code: IssueCode;
  message: string;
  path: IssuePath;
}

export function createIssue(code: IssueCode, path: IssuePath, message: string): ValidationIssue {
  return { severity: ISSUE_CODES[code].severity, code, message, path };
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
