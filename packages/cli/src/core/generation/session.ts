import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  createArchbookShim,
  runHeadless,
  type HeadlessRun,
  type ResultMessage,
  type StreamMessage,
} from "../../io/claude.js";
import { cliEntry, pluginDir } from "../../package.js";
import {
  commandPrompt,
  pluginAssetName,
  pluginCommand,
  projectAssetName,
  projectCommand,
} from "../assets.js";
import type { ProjectPaths } from "../project.js";

export interface Invocation {
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
export function generateInvocation(paths: ProjectPaths): Invocation {
  const projectFile = path.join(
    paths.root,
    ".claude",
    "commands",
    `${projectAssetName("generate")}.md`,
  );
  if (existsSync(projectFile)) {
    return {
      prompt: projectCommand("generate"),
      slashCommand: projectAssetName("generate"),
      fallbackPrompt: commandPrompt(readFileSync(projectFile, "utf8")),
    };
  }
  const plugin = pluginDir();
  return {
    prompt: pluginCommand("generate"),
    slashCommand: pluginAssetName("generate"),
    pluginDir: plugin,
    fallbackPrompt: commandPrompt(
      readFileSync(path.join(plugin, "commands", "generate.md"), "utf8"),
    ),
  };
}

export interface GenerationSessionOptions {
  bin: string;
  cwd: string;
  invocation: Invocation;
  model?: string;
  /** Stops the run like Ctrl+C does. */
  signal?: AbortSignal;
  onMessage: (message: StreamMessage) => void;
  /** Called before the second run, when the slash command turned out to be missing. */
  onFallback?: () => void;
}

export interface GenerationSession {
  interrupted: boolean;
  fellBack: boolean;
  code: number | null;
  result?: ResultMessage;
  stderr: string;
  handlerError?: unknown;
}

/**
 * Runs Claude Code headless with the `archbook` shim on PATH. When the session does not list the
 * slash command, the run is stopped and repeated once with the command's text as the prompt.
 */
export async function runGenerationSession(
  options: GenerationSessionOptions,
): Promise<GenerationSession> {
  const { invocation } = options;
  const shim = createArchbookShim(cliEntry());
  let fellBack = false;
  let interrupted = false;
  let current: HeadlessRun | undefined;
  const onInterrupt = () => {
    interrupted = true;
    current?.kill("SIGINT");
  };
  process.on("SIGINT", onInterrupt);
  options.signal?.addEventListener("abort", onInterrupt);

  const onMessage = (message: StreamMessage) => {
    if (message.type === "system" && message.subtype === "init" && "slash_commands" in message) {
      if (fellBack) return;
      const available = (message.slash_commands ?? []).map((name) => name.replace(/^\//, ""));
      if (!available.includes(invocation.slashCommand)) {
        fellBack = true;
        current?.kill("SIGTERM");
      }
      return;
    }
    options.onMessage(message);
  };
  const attempt = (prompt: string) => {
    current = runHeadless({
      bin: options.bin,
      cwd: options.cwd,
      prompt,
      pluginDir: invocation.pluginDir,
      model: options.model,
      extraPath: [shim.dir],
      onMessage,
    });
    return current.done;
  };

  try {
    let run = await attempt(invocation.prompt);
    if (fellBack && !interrupted) {
      options.onFallback?.();
      run = await attempt(invocation.fallbackPrompt);
    }
    return {
      interrupted,
      fellBack,
      code: run.code,
      result: run.result,
      stderr: run.stderr,
      handlerError: run.handlerError,
    };
  } finally {
    process.off("SIGINT", onInterrupt);
    options.signal?.removeEventListener("abort", onInterrupt);
    shim.dispose();
  }
}
