import { stripVTControlCharacters } from "node:util";
import * as clack from "@clack/prompts";

interface Progress {
  message(line: string): void;
  success(message: string): void;
  error(message: string): void;
}

/** Everything commands print, behind an interface so tests can capture it. */
export interface Output {
  intro(title: string): void;
  outro(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  note(body: string, title?: string): void;
  /** Plain line on stdout, e.g. tables and validation reports. */
  line(text: string): void;
  /** Plain line on stderr, for warnings that must not mix with stdout. */
  errorLine(text: string): void;
  /** Raw JSON on stdout, nothing else, for `--json` modes. */
  json(value: unknown): void;
  progress(title: string, limit: number): Progress;
}

/** Plain lines, for CI logs and files where a live log cannot redraw. */
function plainProgress(title: string): Progress {
  console.log(title);
  return {
    message: (line) => console.log(`  ${line}`),
    success: (message) => console.log(message),
    error: (message) => console.error(message),
  };
}

export const plainOutput: Output = {
  intro: (title) => clack.intro(title),
  outro: (message) => clack.outro(message),
  info: (message) => clack.log.info(message),
  success: (message) => clack.log.success(message),
  warn: (message) => clack.log.warn(message),
  error: (message) => clack.log.error(message),
  note: (body, title) => clack.note(body, title),
  line: (text) => console.log(text),
  errorLine: (text) => console.error(text),
  json: (value) => console.log(JSON.stringify(value, null, 2)),
  progress: plainProgress,
};

/** Same as `plainOutput`, except that progress is a live, scrolling log. */
export const terminalOutput: Output = {
  ...plainOutput,
  progress: (title, limit) => clack.taskLog({ title, limit }),
};

type OutputEventKind =
  | Exclude<keyof Output, "progress">
  | "progress"
  | "progress.message"
  | "progress.success"
  | "progress.error";

interface OutputEvent {
  kind: OutputEventKind;
  text: string;
  title?: string;
}

export interface MemoryOutput extends Output {
  readonly events: OutputEvent[];
  /** All event texts, one per line, for loose assertions. */
  text(): string;
}

/** Records what would be printed, without colors, so tests do not depend on the terminal. */
export function memoryOutput(): MemoryOutput {
  const events: OutputEvent[] = [];
  const record = (kind: OutputEventKind) => (text: string) => {
    events.push({ kind, text: stripVTControlCharacters(text) });
  };
  return {
    events,
    text: () => events.map((event) => event.text).join("\n"),
    intro: record("intro"),
    outro: record("outro"),
    info: record("info"),
    success: record("success"),
    warn: record("warn"),
    error: record("error"),
    note: (body, title) => {
      events.push({ kind: "note", text: stripVTControlCharacters(body), title });
    },
    line: record("line"),
    errorLine: record("errorLine"),
    json: (value) => record("json")(JSON.stringify(value, null, 2)),
    progress: (title) => {
      record("progress")(title);
      return {
        message: record("progress.message"),
        success: record("progress.success"),
        error: record("progress.error"),
      };
    },
  };
}
