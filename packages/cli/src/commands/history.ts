import pc from "picocolors";
import { diffArchitecture, summarizeDiff } from "@archbook/schema";
import { SNAPSHOT_OPERATIONS, listSnapshots, readSnapshot } from "../core/history.js";
import { parseDocumentText, readTextIfExists } from "../io/fs.js";
import { command, relativeTime, table } from "../ui/format.js";
import { resolvePaths, type CommandContext } from "./context.js";

const listInWords = (items: readonly string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

export function historyCommand(options: { json?: boolean }, context: CommandContext): number {
  const { output } = context;
  const paths = resolvePaths(context);
  const snapshots = listSnapshots(paths);
  // Each snapshot holds the state before its operation; what the operation changed is the
  // difference to the next newer snapshot, or to the current file for the newest one.
  let newer = readTextIfExists(paths.architecture) ?? null;
  const entries = snapshots.map((meta) => {
    const content = readSnapshot(paths, meta.id).content;
    const summary = summarizeDiff(
      diffArchitecture(parseDocumentText(content), parseDocumentText(newer)),
    );
    newer = content;
    return { ...meta, changes: summary };
  });

  if (options.json) {
    output.json(entries);
    return 0;
  }
  if (entries.length === 0) {
    output.line(
      `No snapshots yet. They are saved automatically before ${listInWords(SNAPSHOT_OPERATIONS)}.`,
    );
    return 0;
  }
  const rows = [
    ["ID", "WHEN", "OPERATION", "CHANGES AFTER IT"].map((title) => pc.dim(title)),
    ...entries.map((entry) => [
      pc.cyan(entry.id),
      relativeTime(entry.createdAt),
      entry.operation,
      entry.changes,
    ]),
  ];
  output.line(table(rows));
  output.line(
    pc.dim(
      `\nRestore one with ${command("archbook undo --to <id>")}, or the latest with ${command("archbook undo")}.`,
    ),
  );
  return 0;
}
