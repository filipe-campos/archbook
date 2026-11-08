import pc from "picocolors";
import { formatIssuePath, plural, type ValidationIssue } from "@archbook/schema";
import type { ProjectValidation } from "../core/validation.js";

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
