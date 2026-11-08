import pc from "picocolors";
import {
  formatIssuePath,
  validateArchitectureText,
  type ValidationIssue,
  type ValidationResult,
} from "@archbook/schema";
import { createFileSystemIndex } from "@archbook/schema/node";
import { readTextIfExists } from "./fs.js";
import { relativePath, type ProjectPaths } from "./project.js";

export interface ProjectValidation extends ValidationResult {
  /** Path shown to people and agents, relative to the project root. */
  file: string;
  missing: boolean;
}

export function validateProject(paths: ProjectPaths, file = paths.architecture): ProjectValidation {
  const display = relativePath(paths.root, file);
  const text = readTextIfExists(file);
  if (text === undefined) {
    return {
      file: display,
      missing: true,
      valid: false,
      errors: [
        {
          severity: "error",
          code: "invalid-json",
          message: `${display} does not exist.`,
          path: [],
        },
      ],
      warnings: [],
    };
  }
  const result = validateArchitectureText(text, { sourceFiles: createFileSystemIndex(paths.root) });
  return { ...result, file: display, missing: false };
}

const toJsonIssue = (issue: ValidationIssue) => ({
  code: issue.code,
  message: issue.message,
  path: formatIssuePath(issue.path),
});

/** Machine-readable report consumed by the Claude Code agents. */
export function validationJson(result: ProjectValidation) {
  const doc = result.architecture;
  return {
    file: result.file,
    valid: result.valid,
    errors: result.errors.map(toJsonIssue),
    warnings: result.warnings.map(toJsonIssue),
    ...(doc
      ? {
          stats: {
            nodes: doc.nodes.length,
            edges: doc.edges.length,
            flows: doc.flows.length,
            groups: doc.groups.length,
          },
        }
      : {}),
  };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function formatValidation(result: ProjectValidation): string {
  const lines: string[] = [];
  const doc = result.architecture;
  if (result.valid) {
    const stats = doc
      ? ` (${plural(doc.nodes.length, "node")}, ${plural(doc.edges.length, "edge")}, ${plural(doc.flows.length, "flow")})`
      : "";
    lines.push(`${pc.green("✔")} ${result.file} is valid${stats}`);
  } else {
    const counts = [
      plural(result.errors.length, "error"),
      result.warnings.length ? plural(result.warnings.length, "warning") : "",
    ]
      .filter(Boolean)
      .join(", ");
    lines.push(`${pc.red("✖")} ${result.file}: ${counts}`);
  }
  const issueLine = (issue: ValidationIssue) => {
    const label = issue.severity === "error" ? pc.red("error  ") : pc.yellow("warning");
    const where = issue.path.length ? `${pc.cyan(formatIssuePath(issue.path))} ` : "";
    return `  ${label} ${where}${issue.message} ${pc.dim(`(${issue.code})`)}`;
  };
  lines.push(...result.errors.map(issueLine), ...result.warnings.map(issueLine));
  if (result.valid && result.warnings.length)
    lines.push(pc.dim(`  ${plural(result.warnings.length, "warning")}; the file still renders.`));
  return lines.join("\n");
}
