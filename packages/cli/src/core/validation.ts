import {
  formatIssuePath,
  ISSUE_CODES,
  validateArchitecture,
  validateArchitectureText,
  type ValidationIssue,
  type ValidationResult,
} from "@archbook/schema";
import { createFileSystemIndex } from "@archbook/schema/node";
import { readTextIfExists } from "../io/fs.js";
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
          severity: ISSUE_CODES["invalid-json"].severity,
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

/** Validates a document that is not on disk yet, as if it were `file`. */
export function validateDocument(
  paths: ProjectPaths,
  document: unknown,
  file = paths.architecture,
): ProjectValidation {
  const result = validateArchitecture(document, {
    sourceFiles: createFileSystemIndex(paths.root),
  });
  return { ...result, file: relativePath(paths.root, file), missing: false };
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
