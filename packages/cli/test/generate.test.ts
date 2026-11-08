import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateCommand } from "../src/commands/generate.js";
import { listSnapshots } from "../src/lib/history.js";
import { projectPaths } from "../src/lib/project.js";
import { MINIMAL_CONFIG, MINIMAL_SOURCES, minimalDocument, tempProject } from "./helpers.js";

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

const run = (root: string, signal?: AbortSignal) =>
  generateCommand({ cwd: root, claudeBin: fakeClaude, signal });

describe("generate", () => {
  it("writes the generated document, after a snapshot of the previous one", async () => {
    const previous = minimalDocument(["api"]);
    const { root, paths, calls } = setup("success", previous);

    expect(await run(root)).toBe("success");
    expect(readFileSync(paths.architecture, "utf8")).toBe(minimalDocument(["api", "worker"]));

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

    expect(await run(root)).toBe("success");
    expect(calls()[0]!.prompt).toBe("/archbook-generate");
    expect(calls()[0]!.args).not.toContain("--plugin-dir");
  });

  it("restores the previous file when Claude Code fails", async () => {
    const previous = minimalDocument(["api"]);
    const { root, paths } = setup("fail", previous);
    expect(await run(root)).toBe("failed");
    expect(readFileSync(paths.architecture, "utf8")).toBe(previous);
  });

  it("restores the previous file when the result is not valid JSON", async () => {
    const previous = minimalDocument(["api"]);
    const { root, paths } = setup("malformed", previous);
    expect(await run(root)).toBe("failed");
    expect(readFileSync(paths.architecture, "utf8")).toBe(previous);
  });

  it("never leaves a half-written file when interrupted", async () => {
    const previous = minimalDocument(["api"]);
    const { root, paths } = setup("hang", previous);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 700);
    expect(await run(root, controller.signal)).toBe("interrupted");
    expect(readFileSync(paths.architecture, "utf8")).toBe(previous);
  });

  it("removes the file again when the first generation is interrupted", async () => {
    const { root, paths } = setup("hang");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 700);
    expect(await run(root, controller.signal)).toBe("interrupted");
    expect(existsSync(paths.architecture)).toBe(false);
  });

  it("falls back to the command's text when the slash command is not available", async () => {
    const { root, paths, calls } = setup("fallback");
    vi.stubEnv("FAKE_CLAUDE_SLASH", "");
    expect(await run(root)).toBe("success");
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
