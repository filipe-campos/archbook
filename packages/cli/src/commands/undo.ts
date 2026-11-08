import pc from "picocolors";
import { diffArchitecture, summarizeDiff } from "@archbook/schema";
import { historyLimit } from "../core/config.js";
import { undo } from "../core/history.js";
import { relativePath } from "../core/project.js";
import { parseDocumentText } from "../io/fs.js";
import { command, relativeTime } from "../ui/format.js";
import { VERSION } from "../package.js";
import { resolvePaths, type CommandContext } from "./context.js";

export function undoCommand(options: { to?: string }, context: CommandContext): number {
  const { output } = context;
  const paths = resolvePaths(context);
  const result = undo(paths, { to: options.to, version: VERSION, limit: historyLimit(paths) });
  if (!result) {
    output.line("Nothing to undo: no snapshot differs from the current architecture.json.");
    return 0;
  }
  const file = relativePath(paths.root, paths.architecture);
  const summary = summarizeDiff(
    diffArchitecture(parseDocumentText(result.before), parseDocumentText(result.after)),
  );
  if (result.after === null) {
    output.line(
      `${pc.green("✔")} Removed ${file}: it did not exist before ${result.restored.operation}.`,
    );
  } else {
    output.line(
      `${pc.green("✔")} Restored ${file} from ${pc.cyan(result.restored.id)} (${result.restored.operation}, ${relativeTime(result.restored.createdAt)}).`,
    );
    output.line(`  Changes: ${summary}`);
  }
  output.line(
    pc.dim(
      `  Changed your mind? Run ${command("archbook undo")} again (the previous state was saved as ${result.saved.id}).`,
    ),
  );
  return 0;
}
