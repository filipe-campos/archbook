import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { createProgram } from "../src/cli.js";
import type { CommandContext } from "../src/commands/context.js";
import { sha256 } from "../src/io/fs.js";
import { memoryOutput, type MemoryOutput } from "../src/io/output.js";
import { defaultsPrompter } from "../src/io/prompter.js";

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Creates a temporary project with the given files; removed after each test. */
export function tempProject(files: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "archbook-cli-"));
  created.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

/** Every file and folder under `root` with a content hash, for before/after comparisons. */
export function treeSnapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      const relative = path.relative(root, full).split(path.sep).join("/");
      if (statSync(full).isDirectory()) {
        result[`${relative}/`] = "dir";
        walk(full);
      } else {
        result[relative] = sha256(readFileSync(full));
      }
    }
  };
  walk(root);
  return result;
}

export const repoRoot = path.resolve(import.meta.dirname, "../../..");
export const examplePath = path.join(repoRoot, "examples/shop-checkout");
export const exampleDocument = readFileSync(
  path.join(examplePath, "archbook/architecture.json"),
  "utf8",
);

/** A minimal valid document whose source paths exist in `tempProject(MINIMAL_SOURCES)`. */
export const MINIMAL_SOURCES = { "src/server.ts": "export {};\n" };

export function minimalDocument(nodes = ["api"]): string {
  return `${JSON.stringify(
    {
      version: "0.1",
      project: { name: "Demo", description: "Demo project" },
      nodes: [
        { id: "user", kind: "actor", name: "User", summary: "Uses the app." },
        ...nodes.map((id) => ({
          id,
          kind: "service",
          name: id,
          summary: `${id} service.`,
          sources: [{ path: "src/server.ts" }],
        })),
      ],
      edges: nodes.map((id) => ({ id: `user-to-${id}`, from: "user", to: id, kind: "http" })),
    },
    null,
    2,
  )}\n`;
}

export const MINIMAL_CONFIG = `${JSON.stringify({ version: "0.1", project: { name: "Demo" } }, null, 2)}\n`;

/** A non-interactive command context whose output is recorded instead of printed. */
export function testContext(
  cwd: string,
  overrides: Partial<CommandContext> = {},
): CommandContext & { output: MemoryOutput } {
  return {
    cwd,
    interactive: false,
    prompter: defaultsPrompter,
    ...overrides,
    output: memoryOutput(),
  };
}

export interface CliRun {
  exitCode: number;
  output: MemoryOutput;
  /** What the command threw; `main` would print it and exit with 1. */
  error?: unknown;
}

/** Runs `archbook <args>` in-process, non-interactively, with a memory output. */
export async function runCli(...args: string[]): Promise<CliRun> {
  const output = memoryOutput();
  const previous = process.exitCode;
  try {
    await createProgram({ output, prompter: defaultsPrompter, interactive: false }).parseAsync([
      "node",
      "archbook",
      ...args,
    ]);
    return { exitCode: Number(process.exitCode ?? 0), output };
  } catch (error) {
    return { exitCode: 1, output, error };
  } finally {
    process.exitCode = previous;
  }
}
