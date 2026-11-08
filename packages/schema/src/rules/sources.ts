import type { SourceRef } from "../architecture.js";
import type { IssuePath } from "../issues.js";
import { normalizeSourcePath } from "../paths.js";
import type { ElementRule, RuleContext } from "./context.js";

function checkSources({ options, report }: RuleContext, sources: SourceRef[], base: IssuePath) {
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
      report("source-not-found", [...path, "path"], `Source path "${source.path}" does not exist.`);
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
}

export const nodeSources: ElementRule<"nodes"> = (ctx, node, index) =>
  checkSources(ctx, node.sources, ["nodes", index, "sources"]);

export const edgeSources: ElementRule<"edges"> = (ctx, edge, index) =>
  checkSources(ctx, edge.sources, ["edges", index, "sources"]);
