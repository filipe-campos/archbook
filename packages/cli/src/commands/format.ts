import path from "node:path";
import pc from "picocolors";
import { historyLimit } from "../core/config.js";
import { formatFile } from "../core/formatting.js";
import { relativePath } from "../core/project.js";
import { VERSION } from "../package.js";
import { command } from "../ui/format.js";
import { formatValidation } from "../ui/validation.js";
import { resolvePaths, type CommandContext } from "./context.js";

export function formatCommand(
  options: { check?: boolean; file?: string },
  { cwd, output }: CommandContext,
): number {
  const paths = resolvePaths({ cwd });
  const file = options.file ? path.resolve(cwd, options.file) : paths.architecture;
  const display = relativePath(paths.root, file);
  const result = formatFile(paths, file, {
    check: options.check,
    version: VERSION,
    historyLimit: historyLimit(paths),
  });

  if (result.status === "invalid") {
    output.line(formatValidation(result.validation));
    return 1;
  }
  if (result.status === "formatted") {
    output.line(`${pc.green("✔")} ${display} is formatted.`);
    return 0;
  }
  if (!result.written) {
    output.line(`${pc.red("✖")} ${display} is not formatted. Run ${command("archbook format")}.`);
    return 1;
  }
  output.line(`${pc.green("✔")} Formatted ${display}.`);
  if (result.snapshotted) {
    output.line(pc.dim(`  ${command("archbook undo")} restores the previous text.`));
  }
  return 0;
}
