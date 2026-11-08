import { tmpdir } from "node:os";
import path from "node:path";
import pc from "picocolors";
import { ArchitectureSchema, diffArchitecture, summarizeDiff } from "@archbook/schema";
import { UserError } from "../errors.js";
import { projectCommand } from "../core/assets.js";
import { historyLimit, loadConfig } from "../core/config.js";
import { evaluateGeneration, type GenerationDecision } from "../core/generation/outcome.js";
import {
  generateInvocation,
  runGenerationSession,
  type GenerationSession,
} from "../core/generation/session.js";
import { createStreamState, describeStreamMessage } from "../core/generation/stream.js";
import { createSnapshot, readSnapshot, restoreSnapshot } from "../core/history.js";
import { relativePath, type ProjectPaths } from "../core/project.js";
import { validateProject } from "../core/validation.js";
import { INSTALL_HINT, claudeVersion } from "../io/claude.js";
import { parseDocumentText, readTextIfExists, writeFileAtomic } from "../io/fs.js";
import { hasUncommittedChanges } from "../io/git.js";
import type { Output } from "../io/output.js";
import { command } from "../ui/format.js";
import { formatProgressLine } from "../ui/generation.js";
import { formatValidation } from "../ui/validation.js";
import { VERSION } from "../package.js";
import { resolvePaths, type CommandContext } from "./context.js";

export interface GenerateOptions {
  model?: string;
  verbose?: boolean;
  /** Overrides the `claude` executable; used by tests. */
  claudeBin?: string;
  /** Aborts the run as if the user pressed Ctrl+C; used by tests. */
  signal?: AbortSignal;
}

export type GenerateOutcome = "success" | "invalid" | "failed" | "interrupted";

const OUTCOMES: Record<GenerationDecision["kind"], GenerateOutcome> = {
  interrupted: "interrupted",
  failed: "failed",
  malformed: "failed",
  invalid: "invalid",
  success: "success",
};

function checkPrerequisites(paths: ProjectPaths, options: GenerateOptions): void {
  if (!options.claudeBin && !claudeVersion()) {
    throw new UserError(
      `Claude Code is not installed. Install it with ${command(INSTALL_HINT)},\n` +
        `or open Claude Code in this project and run ${command(projectCommand("generate"))}.`,
    );
  }
  if (!loadConfig(paths)) {
    throw new UserError(
      `No archbook/config.json in ${paths.root}. Run ${command("npx archbook init")} first.`,
    );
  }
}

function reportDocument(
  output: Output,
  decision: Extract<GenerationDecision, { kind: "invalid" | "success" }>,
  details: { file: string; changes: string; elapsedMs: number },
): void {
  const { result, validation } = decision;
  output.line(formatValidation(validation));
  const cost = result.total_cost_usd !== undefined ? ` · $${result.total_cost_usd.toFixed(2)}` : "";
  const minutes = ` · ${(details.elapsedMs / 60_000).toFixed(1)} min`;
  output.info(`Changes: ${details.changes}${pc.dim(cost + minutes)}`);
  if (result.result) output.note(result.result.trim(), "Claude Code report");
  if (decision.kind === "invalid") {
    output.warn(
      `${details.file} has validation errors. Run ${command(projectCommand("generate"))} again, fix them by hand, or ${command("archbook undo")} to go back.`,
    );
  } else {
    output.success(
      `Open it with ${command("npx archbook dev")}. Not happy? ${command("npx archbook undo")} restores the previous version.`,
    );
  }
}

export async function generateCommand(
  options: GenerateOptions,
  context: CommandContext,
): Promise<GenerateOutcome> {
  const { output } = context;
  const paths = resolvePaths(context);
  checkPrerequisites(paths, options);

  const file = relativePath(paths.root, paths.architecture);
  if (hasUncommittedChanges(paths.root, paths.architecture)) {
    output.warn(
      `${file} has uncommitted changes. They are saved in a snapshot, so ${command("archbook undo")} can bring them back.`,
    );
  }
  const { snapshot: meta } = createSnapshot(paths, {
    operation: "generate",
    version: VERSION,
    limit: historyLimit(paths),
  });
  const snapshot = readSnapshot(paths, meta.id);
  const restored = `Restored ${file} to its state before generation.`;

  const invocation = generateInvocation(paths);
  const progress = output.progress(
    "Claude Code is documenting your architecture",
    options.verbose ? 40 : 12,
  );
  const state = createStreamState();
  const startedAt = Date.now();
  let session: GenerationSession;
  try {
    session = await runGenerationSession({
      bin: options.claudeBin ?? "claude",
      cwd: paths.root,
      invocation,
      model: options.model,
      signal: options.signal,
      onMessage: (message) => {
        const lines = describeStreamMessage(message, state, { ...options, root: paths.root });
        for (const line of lines) progress.message(formatProgressLine(line));
      },
      onFallback: () =>
        progress.message(
          pc.dim(
            `${invocation.prompt} is not available in this session; sending its instructions directly.`,
          ),
        ),
    });
  } catch (error) {
    restoreSnapshot(paths, snapshot);
    progress.error("Generation stopped by an unexpected error.");
    output.warn(restored);
    throw error;
  }

  const text = readTextIfExists(paths.architecture);
  const parsed = parseDocumentText(text);
  const schemaValid = text !== undefined && ArchitectureSchema.safeParse(parsed).success;
  const decision = evaluateGeneration({
    session,
    text,
    schemaValid,
    validation: schemaValid ? validateProject(paths) : undefined,
  });
  if (decision.kind === "interrupted" || decision.kind === "failed") {
    restoreSnapshot(paths, snapshot);
    progress.error(
      decision.kind === "failed" ? "Claude Code did not finish the generation." : "Interrupted.",
    );
    if (decision.kind === "failed") output.error(`${decision.reason}\n\n${restored}`);
    else output.warn(restored);
    return OUTCOMES[decision.kind];
  }

  progress.success("Claude Code finished.");
  if (decision.kind === "malformed") {
    // A file that does not even match the schema is worse than the previous one: put that back.
    const kept = path.join(tmpdir(), `archbook-failed-${Date.now()}.json`);
    if (text !== undefined) writeFileAtomic(kept, text);
    restoreSnapshot(paths, snapshot);
    const shown = decision.missing ? paths.architecture : kept;
    output.line(formatValidation(validateProject(paths, shown)));
    output.error(
      `The generated ${file} is ${decision.missing ? "missing" : "malformed"}, so the previous version was restored.` +
        (decision.missing ? "" : `\nThe generated file was kept at ${kept}.`),
    );
    return OUTCOMES[decision.kind];
  }

  const changes = summarizeDiff(diffArchitecture(parseDocumentText(snapshot.content), parsed));
  reportDocument(output, decision, { file, changes, elapsedMs: Date.now() - startedAt });
  return OUTCOMES[decision.kind];
}

export const generateExitCode = (outcome: GenerateOutcome): number =>
  outcome === "success" ? 0 : outcome === "interrupted" ? 130 : 1;
