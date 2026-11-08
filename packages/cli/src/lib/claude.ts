import { spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

/** Tools a headless generation may use. File edits are limited to the archbook/ folder. */
export const ALLOWED_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "Skill",
  "Edit(./archbook/**)",
  "Bash(npx archbook *)",
  "Bash(archbook *)",
  "Bash(git diff *)",
  "Bash(git log *)",
  "Bash(git status *)",
  "Bash(git ls-files *)",
  "Bash(ls *)",
  "Bash(wc *)",
];

export const HEADLESS_SYSTEM_PROMPT = [
  "You are running non-interactively, started by the `archbook generate` command.",
  "No user can answer questions: make reasonable decisions, state your assumptions in the final report, and never wait for confirmation.",
  "The Archbook CLI is on PATH as `archbook`. Wherever instructions say `npx archbook <command>`, run `archbook <command>` instead.",
  "Only edit files inside the archbook/ folder.",
].join(" ");

export const INSTALL_HINT = "npm install -g @anthropic-ai/claude-code";

export function claudeVersion(bin = "claude"): string | undefined {
  const result = spawnSync(bin, ["--version"], {
    encoding: "utf8",
    timeout: 15_000,
    shell: process.platform === "win32",
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

/** Messages of `claude -p --output-format stream-json`, reduced to the fields Archbook uses. */
export type StreamMessage =
  | { type: "system"; subtype: "init"; slash_commands?: string[]; model?: string }
  | { type: "system"; subtype: string }
  | {
      type: "assistant";
      parent_tool_use_id?: string | null;
      message: {
        content: Array<{
          type: string;
          text?: string;
          name?: string;
          id?: string;
          input?: Record<string, unknown>;
        }>;
      };
    }
  | { type: "user"; parent_tool_use_id?: string | null }
  | {
      type: "result";
      subtype: string;
      is_error: boolean;
      result?: string;
      total_cost_usd?: number;
      duration_ms?: number;
      num_turns?: number;
      errors?: string[];
    };

export type ResultMessage = Extract<StreamMessage, { type: "result" }>;

export interface HeadlessRun {
  /** Resolves when the process exits. */
  done: Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    result?: ResultMessage;
    stderr: string;
  }>;
  kill: (signal?: NodeJS.Signals) => void;
}

export interface HeadlessOptions {
  bin: string;
  cwd: string;
  prompt: string;
  pluginDir?: string;
  model?: string;
  /** Directories prepended to PATH, e.g. for the `archbook` shim. */
  extraPath?: string[];
  onMessage: (message: StreamMessage) => void;
}

export function runHeadless(options: HeadlessOptions): HeadlessRun {
  const args = [
    "-p",
    options.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--append-system-prompt",
    HEADLESS_SYSTEM_PROMPT,
    ...(options.pluginDir ? ["--plugin-dir", options.pluginDir] : []),
    ...(options.model ? ["--model", options.model] : []),
    // Variadic, so it goes last: anything after it would be read as another tool.
    "--allowedTools",
    ...ALLOWED_TOOLS,
  ];
  const env = { ...process.env };
  if (options.extraPath?.length) {
    env.PATH = [...options.extraPath, env.PATH ?? ""].join(path.delimiter);
  }
  const child = spawn(options.bin, args, {
    cwd: options.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let result: ResultMessage | undefined;
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-8000);
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!line.trim()) return;
    let message: StreamMessage;
    try {
      message = JSON.parse(line) as StreamMessage;
    } catch {
      return;
    }
    if (message.type === "result") result = message;
    options.onMessage(message);
  });

  const done = new Promise<Awaited<HeadlessRun["done"]>>((resolve) => {
    child.on("error", (error) =>
      resolve({ code: -1, signal: null, stderr: stderr + String(error) }),
    );
    child.on("close", (code, signal) => resolve({ code, signal, result, stderr }));
  });
  return {
    done,
    kill: (signal = "SIGTERM") => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    },
  };
}

/**
 * Puts an `archbook` executable that runs this very CLI on PATH, so commands inside the session
 * use the same version the user started, even before it is published or installed globally.
 */
export function createArchbookShim(cliEntry: string): { dir: string; dispose: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "archbook-bin-"));
  const node = process.execPath;
  writeFileSync(path.join(dir, "archbook"), `#!/bin/sh\nexec "${node}" "${cliEntry}" "$@"\n`);
  chmodSync(path.join(dir, "archbook"), 0o755);
  writeFileSync(path.join(dir, "archbook.cmd"), `@"${node}" "${cliEntry}" %*\r\n`);
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

/** One-line description of a tool call, for the progress log. */
export function describeToolUse(name: string, input: Record<string, unknown> = {}): string {
  const str = (key: string) => (typeof input[key] === "string" ? (input[key] as string) : "");
  switch (name) {
    case "Read":
      return `Reading ${str("file_path")}`;
    case "Glob":
      return `Listing ${str("pattern")}`;
    case "Grep":
      return `Searching for ${str("pattern")}`;
    case "Bash":
      return `Running ${str("command").split("\n")[0]}`;
    case "Edit":
    case "Write":
    case "MultiEdit":
      return `Writing ${str("file_path")}`;
    case "Agent":
    case "Task":
      return `Starting ${str("subagent_type") || "subagent"}: ${str("description")}`;
    case "Skill":
      return `Loading skill ${str("skill") || str("name")}`;
    default:
      return name;
  }
}
