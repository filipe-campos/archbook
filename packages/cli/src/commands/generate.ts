import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { ArchitectureSchema, diffArchitecture, summarizeDiff } from "@archbook/schema";
import { ASSET_PREFIX, PLUGIN_NAME, commandPrompt } from "../lib/assets.js";
import {
  INSTALL_HINT,
  claudeVersion,
  createArchbookShim,
  describeToolUse,
  runHeadless,
  type ResultMessage,
  type StreamMessage,
} from "../lib/claude.js";
import { historyLimit, loadConfig } from "../lib/config.js";
import { readTextIfExists, writeFileAtomic } from "../lib/fs.js";
import { hasUncommittedChanges } from "../lib/git.js";
import { createSnapshot, readSnapshot, restoreSnapshot } from "../lib/history.js";
import { relativePath, type ProjectPaths } from "../lib/project.js";
import { UserError, command } from "../lib/ui.js";
import { formatValidation, validateProject } from "../lib/validation.js";
import { VERSION, cliEntry, pluginDir } from "../package.js";
import { resolvePaths, type GlobalOptions } from "./basic.js";

export interface GenerateOptions extends GlobalOptions {
  model?: string;
  verbose?: boolean;
  /** Overrides the `claude` executable; used by tests. */
  claudeBin?: string;
  /** Aborts the run as if the user pressed Ctrl+C; used by tests. */
  signal?: AbortSignal;
}

export type GenerateOutcome = "success" | "invalid" | "failed" | "interrupted";

interface Invocation {
  prompt: string;
  /** Name the command must have in the session's slash command list. */
  slashCommand: string;
  pluginDir?: string;
  /** Same instructions as plain text, for when the slash command is not available. */
  fallbackPrompt: string;
}

/**
 * Uses the project's copy of the command when `archbook init` installed it; otherwise loads the
 * bundled plugin for this session only.
 */
function invocation(paths: ProjectPaths): Invocation {
  const projectCommand = path.join(paths.root, ".claude", "commands", `${ASSET_PREFIX}generate.md`);
  if (existsSync(projectCommand)) {
    return {
      prompt: `/${ASSET_PREFIX}generate`,
      slashCommand: `${ASSET_PREFIX}generate`,
      fallbackPrompt: commandPrompt(readFileSync(projectCommand, "utf8")),
    };
  }
  const plugin = pluginDir();
  return {
    prompt: `/${PLUGIN_NAME}:generate`,
    slashCommand: `${PLUGIN_NAME}:generate`,
    pluginDir: plugin,
    fallbackPrompt: commandPrompt(
      readFileSync(path.join(plugin, "commands", "generate.md"), "utf8"),
    ),
  };
}

const parse = (text: string | null | undefined): unknown => {
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

interface Progress {
  message: (line: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

/** A live, scrolling log in a terminal; plain lines when output goes to a file or CI log. */
function createProgress(title: string, limit: number): Progress {
  if (process.stdout.isTTY) return clack.taskLog({ title, limit });
  console.log(title);
  return {
    message: (line) => console.log(`  ${line}`),
    success: (message) => console.log(message),
    error: (message) => console.error(message),
  };
}

export async function generateCommand(options: GenerateOptions): Promise<GenerateOutcome> {
  const paths = resolvePaths(options);
  const bin = options.claudeBin ?? "claude";
  if (!options.claudeBin && !claudeVersion()) {
    throw new UserError(
      `Claude Code is not installed. Install it with ${command(INSTALL_HINT)},\n` +
        `or open Claude Code in this project and run ${command("/archbook-generate")}.`,
    );
  }
  if (!loadConfig(paths)) {
    throw new UserError(
      `No archbook/config.json in ${paths.root}. Run ${command("npx archbook init")} first.`,
    );
  }

  const file = relativePath(paths.root, paths.architecture);
  if (hasUncommittedChanges(paths.root, paths.architecture)) {
    clack.log.warn(
      `${file} has uncommitted changes. They are saved in a snapshot, so ${command("archbook undo")} can bring them back.`,
    );
  }
  const { snapshot: snapshotMeta } = createSnapshot(paths, {
    operation: "generate",
    version: VERSION,
    limit: historyLimit(paths),
  });
  const snapshot = readSnapshot(paths, snapshotMeta.id);
  const restore = () => restoreSnapshot(paths, snapshot);

  const target = invocation(paths);
  const shim = createArchbookShim(cliEntry());
  const progress = createProgress(
    "Claude Code is documenting your architecture",
    options.verbose ? 40 : 12,
  );
  const agentNames = new Map<string, string>();

  const startedAt = Date.now();
  let fellBack = false;
  let interrupted = false;
  let current: ReturnType<typeof runHeadless> | undefined;
  const onInterrupt = () => {
    interrupted = true;
    current?.kill("SIGINT");
  };
  process.on("SIGINT", onInterrupt);
  options.signal?.addEventListener("abort", onInterrupt);

  const onMessage = (message: StreamMessage) => {
    if (
      message.type === "system" &&
      message.subtype === "init" &&
      "slash_commands" in message &&
      !fellBack
    ) {
      const available = (message.slash_commands ?? []).map((name) => name.replace(/^\//, ""));
      if (!available.includes(target.slashCommand)) {
        fellBack = true;
        current?.kill("SIGTERM");
      }
      return;
    }
    if (message.type !== "assistant") return;
    const agent = message.parent_tool_use_id
      ? agentNames.get(message.parent_tool_use_id)
      : undefined;
    const prefix = agent ? pc.dim(`[${agent}] `) : "";
    for (const block of message.message.content) {
      if (block.type === "tool_use" && block.name) {
        if ((block.name === "Agent" || block.name === "Task") && block.id) {
          agentNames.set(
            block.id,
            String(block.input?.subagent_type ?? "subagent").replace(`${PLUGIN_NAME}:`, ""),
          );
        }
        progress.message(
          prefix + describeToolUse(block.name, block.input).replace(paths.root + path.sep, ""),
        );
      } else if (block.type === "text" && block.text && (options.verbose || !agent)) {
        const firstLine = block.text.trim().split("\n")[0] ?? "";
        if (firstLine) progress.message(prefix + pc.dim(firstLine.slice(0, 160)));
      }
    }
  };

  let outcome: { code: number | null; result?: ResultMessage; stderr: string };
  try {
    current = runHeadless({
      bin,
      cwd: paths.root,
      prompt: target.prompt,
      pluginDir: target.pluginDir,
      model: options.model,
      extraPath: [shim.dir],
      onMessage,
    });
    outcome = await current.done;
    if (fellBack && !interrupted) {
      progress.message(
        pc.dim(
          `${target.prompt} is not available in this session; sending its instructions directly.`,
        ),
      );
      current = runHeadless({
        bin,
        cwd: paths.root,
        prompt: target.fallbackPrompt,
        pluginDir: target.pluginDir,
        model: options.model,
        extraPath: [shim.dir],
        onMessage,
      });
      outcome = await current.done;
    }
  } finally {
    process.off("SIGINT", onInterrupt);
    options.signal?.removeEventListener("abort", onInterrupt);
    shim.dispose();
  }

  if (interrupted) {
    restore();
    progress.error("Interrupted.");
    clack.log.warn(`Restored ${file} to its state before generation.`);
    return "interrupted";
  }

  const result = outcome.result;
  const failed = outcome.code !== 0 || !result || result.is_error;
  if (failed) {
    restore();
    progress.error("Claude Code did not finish the generation.");
    const reason =
      result?.errors?.join("\n") ||
      result?.result ||
      outcome.stderr.trim().split("\n").slice(-5).join("\n") ||
      `exit code ${outcome.code}`;
    clack.log.error(`${reason}\n\nRestored ${file} to its state before generation.`);
    return "failed";
  }
  progress.success("Claude Code finished.");

  const text = readTextIfExists(paths.architecture);
  const parsed = parse(text);
  if (text === undefined || !ArchitectureSchema.safeParse(parsed).success) {
    // A file that does not even match the schema is worse than the previous one: put that back.
    const kept = path.join(tmpdir(), `archbook-failed-${Date.now()}.json`);
    if (text !== undefined) writeFileAtomic(kept, text);
    restore();
    console.log(
      formatValidation(validateProject(paths, text === undefined ? paths.architecture : kept)),
    );
    clack.log.error(
      `The generated ${file} is ${text === undefined ? "missing" : "malformed"}, so the previous version was restored.` +
        (text !== undefined ? `\nThe generated file was kept at ${kept}.` : ""),
    );
    return "failed";
  }

  const validation = validateProject(paths);
  const changes = summarizeDiff(diffArchitecture(parse(snapshot.content), parsed));
  console.log(formatValidation(validation));
  const cost = result.total_cost_usd !== undefined ? ` · $${result.total_cost_usd.toFixed(2)}` : "";
  const minutes = ` · ${((Date.now() - startedAt) / 60_000).toFixed(1)} min`;
  clack.log.info(`Changes: ${changes}${pc.dim(cost + minutes)}`);
  if (result.result) clack.note(result.result.trim(), "Claude Code report");
  if (!validation.valid) {
    clack.log.warn(
      `${file} has validation errors. Run ${command("/archbook-generate")} again, fix them by hand, or ${command("archbook undo")} to go back.`,
    );
    return "invalid";
  }
  clack.log.success(
    `Open it with ${command("npx archbook dev")}. Not happy? ${command("npx archbook undo")} restores the previous version.`,
  );
  return "success";
}

export const generateExitCode = (outcome: GenerateOutcome): number =>
  outcome === "success" ? 0 : outcome === "interrupted" ? 130 : 1;
