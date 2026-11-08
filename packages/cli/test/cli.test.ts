import { CommanderError, type Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgram, main } from "../src/cli.js";
import { UserError } from "../src/errors.js";
import { loadConfig } from "../src/lib/config.js";
import { projectPaths } from "../src/lib/project.js";
import { MINIMAL_CONFIG, MINIMAL_SOURCES, minimalDocument, tempProject } from "./helpers.js";

const unexpected = vi.hoisted(() => ({ error: undefined as Error | undefined }));

vi.mock("../src/lib/history.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/lib/history.js")>();
  return {
    ...original,
    listSnapshots: (...args: Parameters<typeof original.listSnapshots>) => {
      if (unexpected.error) throw unexpected.error;
      return original.listSnapshots(...args);
    },
  };
});

const project = () =>
  tempProject({
    ...MINIMAL_SOURCES,
    "archbook/config.json": MINIMAL_CONFIG,
    "archbook/architecture.json": minimalDocument(),
  });

let errors: string[];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(
      args.map((arg) => (arg instanceof Error ? (arg.stack ?? "") : String(arg))).join(" "),
    );
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  process.exitCode = undefined;
  unexpected.error = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const runMain = (...args: string[]) => main(["node", "archbook", ...args]);
const stackLines = () => errors.join("\n").match(/^\s+at /m);

describe("main", () => {
  it("prints expected errors without a stack trace", async () => {
    await runMain("undo", "--to", "does-not-exist", "--cwd", project());
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/No snapshot matches "does-not-exist"/);
    expect(stackLines()).toBeNull();
  });

  it("hides the stack of unexpected errors unless ARCHBOOK_DEBUG=1", async () => {
    unexpected.error = new Error("disk on fire");
    await runMain("history", "--cwd", project());
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/Unexpected error: disk on fire/);
    expect(errors.join("\n")).toMatch(/ARCHBOOK_DEBUG=1/);
    expect(stackLines()).toBeNull();

    errors = [];
    vi.stubEnv("ARCHBOOK_DEBUG", "1");
    await runMain("history", "--cwd", project());
    expect(process.exitCode).toBe(1);
    expect(stackLines()).not.toBeNull();
  });
});

describe("loadConfig", () => {
  it("reports invalid JSON as a user error", () => {
    const paths = projectPaths(tempProject({ "archbook/config.json": "{ nope" }));
    expect(() => loadConfig(paths)).toThrow(UserError);
    expect(() => loadConfig(paths)).toThrow(/not valid JSON/);
  });

  it("reports invalid fields as a user error with their path", () => {
    const config = JSON.stringify({
      version: "0.1",
      project: { name: "Demo" },
      history: { limit: "x" },
    });
    const paths = projectPaths(tempProject({ "archbook/config.json": config }));
    expect(() => loadConfig(paths)).toThrow(UserError);
    expect(() => loadConfig(paths)).toThrow(/history\.limit/);
  });
});

describe("option validation", () => {
  /** Runs the program with commander's exits turned into exceptions and its output captured. */
  async function parseError(...args: string[]): Promise<{ error: CommanderError; output: string }> {
    const program = createProgram();
    let output = "";
    const configure = (command: Command) => {
      command.exitOverride().configureOutput({
        writeErr: (text) => (output += text),
        writeOut: () => {},
      });
      command.commands.forEach(configure);
    };
    configure(program);
    try {
      await program.parseAsync(["node", "archbook", ...args]);
    } catch (error) {
      if (error instanceof CommanderError) return { error, output };
      throw error;
    }
    throw new Error("expected the command to fail");
  }

  it.each([["abc"], ["70000"], ["0"], ["80.5"]])("rejects --port %s", async (port) => {
    const { error, output } = await parseError("dev", "--port", port, "--cwd", project());
    expect(error.exitCode).not.toBe(0);
    expect(output).toMatch(/option '-p, --port <port>' argument '.*' is invalid/);
    expect(output).toMatch(/1 to 65535/);
    expect(output).not.toMatch(/^\s+at /m);
  });

  it("rejects unknown snapshot operations", async () => {
    const { error, output } = await parseError("snapshot", "--op", "foo", "--cwd", project());
    expect(error.exitCode).not.toBe(0);
    expect(output).toMatch(/argument 'foo' is invalid\. Allowed choices are generate, sync/);
    expect(output).not.toMatch(/^\s+at /m);
  });
});
