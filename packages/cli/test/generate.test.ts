import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateCommand } from "../src/commands/generate.js";
import { listSnapshots } from "../src/core/history.js";
import { projectPaths } from "../src/core/project.js";
import {
  MINIMAL_CONFIG,
  MINIMAL_SOURCES,
  minimalDocument,
  tempProject,
  testContext,
} from "./helpers.js";

const fakeClaude = path.join(import.meta.dirname, "fixtures/fake-claude.mjs");
beforeAll(() => chmodSync(fakeClaude, 0o755));
afterEach(() => vi.unstubAllEnvs());

function setup(scenario: string, existing?: string) {
  const root = tempProject({
    ...MINIMAL_SOURCES,
    "archbook/config.json": MINIMAL_CONFIG,
    "generated.json": minimalDocument(["api", "worker"]),
    ...(existing ? { "archbook/architecture.json": existing } : {}),
  });
  vi.stubEnv("FAKE_CLAUDE_SCENARIO", scenario);
  vi.stubEnv("FAKE_CLAUDE_DOC", path.join(root, "generated.json"));
  vi.stubEnv("FAKE_CLAUDE_SLASH", "archbook:generate");
  vi.stubEnv("FAKE_CLAUDE_LOG", path.join(root, "calls.log"));
  const calls = () =>
    readFileSync(path.join(root, "calls.log"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { prompt: string; args: string[] });
  return { root, paths: projectPaths(root), calls };
}

async function run(root: string, signal?: AbortSignal) {
  const context = testContext(root);
  const outcome = await generateCommand({ claudeBin: fakeClaude, signal }, context);
  return { outcome, output: context.output };
}

const RESTORED = "Restored archbook/architecture.json to its state before generation.";

describe("generate", () => {
  it("writes the generated document, after a snapshot of the previous one", async () => {
    const previous = minimalDocument(["api"]);
    const { root, paths, calls } = setup("success", previous);

    const { outcome, output } = await run(root);
    expect(outcome).toBe("success");
    expect(readFileSync(paths.architecture, "utf8")).toBe(minimalDocument(["api", "worker"]));
    expect(output.events).toEqual(
      expect.arrayContaining([
        { kind: "progress", text: "Claude Code is documenting your architecture" },
        { kind: "progress.message", text: "Reading src/server.ts" },
        { kind: "progress.success", text: "Claude Code finished." },
        { kind: "note", text: "Documented 2 nodes.", title: "Claude Code report" },
      ]),
    );
    expect(output.text()).toMatch(/Changes: \+1 node, \+1 edge · \$0\.42 · 0\.\d min/);
    expect(output.events.at(-1)).toMatchObject({ kind: "success", text: /npx archbook dev/ });

    const [snapshot] = listSnapshots(paths);
    expect(snapshot).toMatchObject({ operation: "generate", existed: true });
    const [call] = calls();
    expect(call!.prompt).toBe("/archbook:generate");
    expect(call!.args).toEqual(
      expect.arrayContaining([
        "--plugin-dir",
        "--allowedTools",
        "Edit(./archbook/architecture.json)",
        "Bash(archbook validate *)",
      ]),
    );
    expect(call!.args.indexOf("--allowedTools")).toBeGreaterThan(
      call!.args.indexOf("--plugin-dir"),
    );
    expect(call!.args).not.toContain("Bash(archbook *)");
  });

  it("uses the project's copy of the command when init installed it", async () => {
    const { root, calls } = setup("success");
    mkdirSync(path.join(root, ".claude/commands"), { recursive: true });
    writeFileSync(
      path.join(root, ".claude/commands/archbook-generate.md"),
      "---\ndescription: d\n---\nGenerate it.\n",
    );
    vi.stubEnv("FAKE_CLAUDE_SLASH", "archbook-generate");

    expect((await run(root)).outcome).toBe("success");
    expect(calls()[0]!.prompt).toBe("/archbook-generate");
    expect(calls()[0]!.args).not.toContain("--plugin-dir");
  });

  it("restores the previous file when Claude Code fails", async () => {
    const previous = minimalDocument(["api"]);
    const { root, paths } = setup("fail", previous);
    const { outcome, output } = await run(root);
    expect(outcome).toBe("failed");
    expect(readFileSync(paths.architecture, "utf8")).toBe(previous);
    expect(output.events).toContainEqual({
      kind: "progress.error",
      text: "Claude Code did not finish the generation.",
    });
    expect(output.events).toContainEqual({ kind: "error", text: `Something broke\n\n${RESTORED}` });
  });

  it("restores the previous file when the result is not valid JSON", async () => {
    const previous = minimalDocument(["api"]);
    const { root, paths } = setup("malformed", previous);
    const { outcome, output } = await run(root);
    expect(outcome).toBe("failed");
    expect(readFileSync(paths.architecture, "utf8")).toBe(previous);
    const error = output.events.find((event) => event.kind === "error")!.text;
    expect(error).toMatch(/is malformed, so the previous version was restored/);
    const kept = /kept at (.+\.json)/.exec(error)![1]!;
    expect(readFileSync(kept, "utf8")).toBe("{ nope");
    expect(output.text()).toMatch(/Invalid JSON/);
  });

  it("skips malformed stream messages instead of crashing", async () => {
    const { root, paths } = setup("malformed-stream", minimalDocument(["api"]));
    expect((await run(root)).outcome).toBe("success");
    expect(readFileSync(paths.architecture, "utf8")).toBe(minimalDocument(["api", "worker"]));
  });

  it("does not report an unreadable previous file as created", async () => {
    const { root } = setup("success", "{ nope");
    const { outcome, output } = await run(root);
    expect(outcome).toBe("success");
    expect(output.text()).toMatch(/Changes: /);
    expect(output.text()).not.toMatch(/file created/);
  });

  it("never leaves a half-written file when interrupted", async () => {
    const previous = minimalDocument(["api"]);
    const { root, paths } = setup("hang", previous);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 700);
    const { outcome, output } = await run(root, controller.signal);
    expect(outcome).toBe("interrupted");
    expect(readFileSync(paths.architecture, "utf8")).toBe(previous);
    expect(output.events.slice(-2)).toEqual([
      { kind: "progress.error", text: "Interrupted." },
      { kind: "warn", text: RESTORED },
    ]);
  });

  it("removes the file again when the first generation is interrupted", async () => {
    const { root, paths } = setup("hang");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 700);
    expect((await run(root, controller.signal)).outcome).toBe("interrupted");
    expect(existsSync(paths.architecture)).toBe(false);
  });

  it("falls back to the command's text when the slash command is not available", async () => {
    const { root, paths, calls } = setup("fallback");
    vi.stubEnv("FAKE_CLAUDE_SLASH", "");
    const { outcome, output } = await run(root);
    expect(outcome).toBe("success");
    expect(output.events).toContainEqual({
      kind: "progress.message",
      text: "/archbook:generate is not available in this session; sending its instructions directly.",
    });
    const prompts = calls().map((call) => call.prompt);
    expect(prompts[0]).toBe("/archbook:generate");
    expect(prompts[1]).toContain("archbook:scanner");
    expect(existsSync(paths.architecture)).toBe(true);
  });

  it("requires archbook init first", async () => {
    const root = tempProject();
    await expect(run(root)).rejects.toThrow(/archbook init/);
  });
});
