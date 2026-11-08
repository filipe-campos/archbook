import pc from "picocolors";
import { ARCHITECTURE_SCHEMA_URL } from "@archbook/schema";
import { historyLimit } from "../core/config.js";
import { WARN_UNCOMMITTED_OPERATIONS, createSnapshot } from "../core/history.js";
import { relativePath } from "../core/project.js";
import { hasUncommittedChanges } from "../io/git.js";
import { GENERATED_BY, VERSION } from "../package.js";
import { resolvePaths, type CommandContext } from "./context.js";

const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/** Hidden: called by the Claude Code commands before they change architecture.json. */
export function snapshotCommand(options: { op: string }, context: CommandContext): number {
  const { output } = context;
  const paths = resolvePaths(context);
  if (
    WARN_UNCOMMITTED_OPERATIONS.includes(options.op) &&
    hasUncommittedChanges(paths.root, paths.architecture)
  ) {
    output.errorLine(
      pc.yellow(
        `Warning: ${relativePath(paths.root, paths.architecture)} has uncommitted changes. A snapshot is saved anyway, so "archbook undo" can bring this version back.`,
      ),
    );
  }
  const { snapshot, created } = createSnapshot(paths, {
    operation: options.op,
    version: VERSION,
    limit: historyLimit(paths),
  });
  output.line(
    created
      ? `Snapshot ${snapshot.id} saved.`
      : `Snapshot ${snapshot.id} already holds the current architecture.json; nothing new to save.`,
  );
  output.line(`Time: ${isoNow()}`);
  output.line(`Schema: ${ARCHITECTURE_SCHEMA_URL}`);
  output.line(`Generated-By: ${GENERATED_BY}`);
  return 0;
}
