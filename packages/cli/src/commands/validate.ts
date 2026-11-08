import path from "node:path";
import pc from "picocolors";
import { validateProject, validationJson } from "../core/validation.js";
import { command } from "../ui/format.js";
import { formatValidation } from "../ui/validation.js";
import { resolvePaths, type CommandContext } from "./context.js";

export function validateCommand(
  options: { json?: boolean; file?: string },
  { cwd, output }: CommandContext,
): number {
  const paths = resolvePaths({ cwd });
  const file = options.file ? path.resolve(cwd, options.file) : paths.architecture;
  const result = validateProject(paths, file);
  if (options.json) {
    output.json(validationJson(result));
  } else {
    output.line(formatValidation(result));
    if (result.missing)
      output.line(
        pc.dim(
          `  Create it with ${command("archbook generate")}, or ${command("archbook init")} first.`,
        ),
      );
  }
  return result.valid ? 0 : 1;
}
