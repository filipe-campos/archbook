import { tmpdir } from "node:os";
import path from "node:path";
import pc from "picocolors";
import {
  ArchitectureSchema,
  diffArchitecture,
  summarizeDiff,
  type Architecture,
} from "@archbook/schema";
import { UserError } from "../errors.js";
import { projectCommand } from "../core/assets.js";
import { historyLimit, loadConfig } from "../core/config.js";
import { evaluateGeneration, type GenerationDecision } from "../core/generation/outcome.js";
import {
  generateInvocation,
  runGenerationSession,
  type GenerationSession,
} from "../core/generation/session.js";
import {
  GENERATION_PHASES,
  createStreamState,
  describeStreamMessage,
} from "../core/generation/stream.js";
import { createSnapshot, readSnapshot, restoreSnapshot } from "../core/history.js";
import { relativePath, type ProjectPaths } from "../core/project.js";
import { validateProject } from "../core/validation.js";
import { INSTALL_HINT, claudeVersion } from "../io/claude.js";
import { parseDocumentText, readTextIfExists, writeFileAtomic } from "../io/fs.js";
import { hasUncommittedChanges } from "../io/git.js";
import type { Output } from "../io/output.js";
import { command } from "../ui/format.js";
import {
  formatGenerationPlan,
  formatGenerationSummary,
  formatPhaseDone,
  formatProgressLine,
} from "../ui/generation.js";
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

/** One live log per phase; a finished phase collapses into a single line with its duration. */
function phasedProgress(output: Output, limit: number) {
  const start = (title: string) => ({
    title,
    startedAt: Date.now(),
    log: output.progress(title, limit),
  });
  let current = start("Reading the project");
  const done = () =>
    current.log.success(formatPhaseDone(current.title, Date.now() - current.startedAt));
  return {
    phase(title: string) {
      done();
      current = start(title);
    },
    message: (line: string) => current.log.message(line),
    success: done,
    error: (message: string) => current.log.error(message),
  };
}

function reportDocument(
  output: Output,
  decision: Extract<GenerationDecision, { kind: "invalid" | "success" }>,
  details: { file: string; document: Architecture; changes: string; elapsedMs: number },
): void {
  const { result, validation } = decision;
  if (validation.errors.length || validation.warnings.length) {
    output.line(formatValidation(validation));
  }
  const { document } = details;
  output.note(
    formatGenerationSummary({
      nodes: document.nodes.length,
      edges: document.edges.length,
      flows: document.flows.length,
      groups: document.groups.length,
      changes: details.changes,
      elapsedMs: details.elapsedMs,
      costUsd: result.total_cost_usd,
      warnings: validation.warnings.length,
    }),
    decision.kind === "success" ? "Architecture documented" : "Architecture written, with errors",
  );
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
  output.note(
    formatGenerationPlan(GENERATION_PHASES),
    "Claude Code is documenting your architecture",
  );
  const progress = phasedProgress(output, options.verbose ? 40 : 12);
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
        for (const line of lines) {
          if (line.kind === "phase") progress.phase(line.text);
          else progress.message(formatProgressLine(line));
        }
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
  const schema = text === undefined ? undefined : ArchitectureSchema.safeParse(parsed);
  const schemaValid = schema?.success === true;
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

  progress.success();
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
  reportDocument(output, decision, {
    file,
    document: schema!.data!,
    changes,
    elapsedMs: Date.now() - startedAt,
  });
  return OUTCOMES[decision.kind];
}

export const generateExitCode = (outcome: GenerateOutcome): number =>
  outcome === "success" ? 0 : outcome === "interrupted" ? 130 : 1;
