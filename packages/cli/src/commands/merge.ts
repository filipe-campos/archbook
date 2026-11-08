import path from "node:path";
import { applyDraft } from "../core/merge.js";
import { validationJson } from "../core/validation.js";
import { resolvePaths, type CommandContext } from "./context.js";

/** Hidden: merges a draft written by the Claude Code commands and prints a JSON report. */
export function mergeCommand(
  options: { draft: string; replaceStructure?: boolean },
  { cwd, output }: CommandContext,
): number {
  const paths = resolvePaths({ cwd });
  const result = applyDraft(paths, path.resolve(cwd, options.draft), {
    replaceStructure: options.replaceStructure,
  });
  output.json({
    written: result.written,
    draft: result.draft,
    ...result.report,
    validation: validationJson(result.validation),
  });
  return result.written ? 0 : 1;
}
