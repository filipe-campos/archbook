import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  askQuestions,
  buildConfig,
  parseLines,
  performInit,
  type InitAnswers,
} from "../src/commands/init.js";
import { describePlan, executeRemoval, planRemoval } from "../src/commands/remove.js";
import { readManifest, type Manifest } from "../src/lib/manifest.js";
import { isSafeProjectPath, projectPaths, resolveInside } from "../src/lib/project.js";
import { defaultsPrompter, type Prompter } from "../src/lib/prompter.js";
import { UserError } from "../src/lib/ui.js";
import { repoRoot, tempProject, treeSnapshot } from "./helpers.js";

const pluginRoot = path.join(repoRoot, "plugin");
const backupDir = mkdtempSync(path.join(tmpdir(), "archbook-backups-"));
afterAll(() => rmSync(backupDir, { recursive: true, force: true }));

const answers: InitAnswers = {
  name: "Demo",
  description: "A demo project",
  audience: "developers",
  language: "en",
  detailLevel: "medium",
  flows: ["checkout"],
  ignore: ["node_modules"],
  defaultBranch: "main",
};

const USER_FILES = {
  "package.json": '{ "name": "demo" }\n',
  // No trailing newline on purpose: removal must give back exactly these bytes.
  ".gitignore": "node_modules\n.env",
  ".claude/settings.json": '{ "permissions": {} }\n',
  "src/index.ts": "console.log('hi');\n",
};

async function install(root: string, prompter: Prompter = defaultsPrompter) {
  const paths = projectPaths(root);
  const report = await performInit(paths, buildConfig(answers, []), prompter, { pluginRoot });
  return { paths, report };
}

describe("init", () => {
  it("writes the config, the Claude Code assets, the .gitignore lines and a manifest", async () => {
    const root = tempProject(USER_FILES);
    const { paths, report } = await install(root);

    expect(JSON.parse(readFileSync(paths.config, "utf8"))).toMatchObject({
      version: "0.1",
      project: { name: "Demo" },
      flows: ["checkout"],
    });
    expect(existsSync(path.join(root, ".claude/commands/archbook-generate.md"))).toBe(true);
    expect(existsSync(path.join(root, ".claude/agents/archbook-scanner.md"))).toBe(true);
    expect(existsSync(path.join(root, ".claude/skills/archbook-schema/SKILL.md"))).toBe(true);
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toBe(
      "node_modules\n.env\n\n# Archbook\narchbook/.history/\narchbook/dist/\n",
    );
    expect(report.skipped).toEqual([]);

    const manifest = readManifest(paths)!;
    const changes = Object.fromEntries(manifest.entries.map((entry) => [entry.path, entry.change]));
    expect(changes).toMatchObject({
      archbook: "created-dir",
      ".claude/commands": "created-dir",
      ".claude/commands/archbook-generate.md": "created",
      ".gitignore": "modified",
    });
    expect(changes[".claude"]).toBeUndefined();
  });

  it("is idempotent", async () => {
    const root = tempProject(USER_FILES);
    await install(root);
    const before = treeSnapshot(root);
    const { report } = await install(root);
    expect(report.created).toEqual([]);
    expect(report.unchanged.length).toBeGreaterThan(0);
    const after = treeSnapshot(root);
    delete before["archbook/.manifest.json"];
    delete after["archbook/.manifest.json"];
    expect(after).toEqual(before);
  });

  it("never overwrites an existing file without asking", async () => {
    const root = tempProject({
      ...USER_FILES,
      ".claude/commands/archbook-generate.md": "my own command\n",
    });
    const { report } = await install(root);
    expect(report.skipped).toEqual([".claude/commands/archbook-generate.md"]);
    expect(readFileSync(path.join(root, ".claude/commands/archbook-generate.md"), "utf8")).toBe(
      "my own command\n",
    );

    const confirm = vi.fn(async () => true);
    const { report: second } = await install(root, {
      ...defaultsPrompter,
      interactive: true,
      confirm,
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(second.replaced).toEqual([".claude/commands/archbook-generate.md"]);
  });

  it("accepts only http(s) repository URLs", async () => {
    let validate: ((value: string) => string | undefined) | undefined;
    await askQuestions(
      {
        ...defaultsPrompter,
        text: async (options) => {
          if (options.message.startsWith("Repository URL")) validate = options.validate;
          return options.defaultValue ?? "";
        },
      },
      tempProject(),
    );
    expect(validate).toBeDefined();
    for (const value of ["", "https://github.com/o/r", "http://localhost:8080/repo"]) {
      expect(validate!(value)).toBeUndefined();
    }
    for (const value of ["javascript:alert(1)", "data:text/html,x", "file:///repo", "github.com"]) {
      expect(validate!(value)).toMatch(/http or https/);
    }
  });

  it("parses free-text lists", () => {
    expect(parseLines("- checkout\n\n2. user signup\n  * Stripe webhook  \n")).toEqual([
      "checkout",
      "user signup",
      "Stripe webhook",
    ]);
  });
});

describe("remove", () => {
  it("leaves the project exactly as it was before init", async () => {
    const root = tempProject(USER_FILES);
    const before = treeSnapshot(root);
    const { paths } = await install(root);
    writeFileSync(paths.architecture, "{}\n");

    const result = await executeRemoval(paths, planRemoval(paths), { backupDir });
    expect(treeSnapshot(root)).toEqual(before);
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toBe(USER_FILES[".gitignore"]);
    expect(result.backup).toMatch(/archbook-removed-.*\.tar\.gz$/);
    expect(existsSync(result.backup!)).toBe(true);
  });

  it("deletes a .gitignore it created when nothing else was added", async () => {
    const { ".gitignore": _ignored, ...files } = USER_FILES;
    const root = tempProject(files);
    const before = treeSnapshot(root);
    const { paths } = await install(root);
    await executeRemoval(paths, planRemoval(paths), { backupDir });
    expect(treeSnapshot(root)).toEqual(before);
  });

  it("keeps lines the user added to .gitignore after init", async () => {
    const root = tempProject(USER_FILES);
    const { paths } = await install(root);
    writeFileSync(
      path.join(root, ".gitignore"),
      `${readFileSync(path.join(root, ".gitignore"), "utf8")}coverage/\n`,
    );
    await executeRemoval(paths, planRemoval(paths), { backupDir });
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toBe(
      "node_modules\n.env\ncoverage/\n",
    );
  });

  it("asks before deleting a file the user edited, and keeps it when told to", async () => {
    const root = tempProject(USER_FILES);
    const { paths } = await install(root);
    const edited = ".claude/agents/archbook-scanner.md";
    writeFileSync(path.join(root, edited), "my tweaks\n");

    const plan = planRemoval(paths);
    expect(describePlan(plan)).toContain("edited since install");
    const confirmEdited = vi.fn(async () => false);
    const result = await executeRemoval(paths, plan, { confirmEdited, backupDir });

    expect(confirmEdited).toHaveBeenCalledWith(edited);
    expect(result.kept).toEqual([edited]);
    expect(readFileSync(path.join(root, edited), "utf8")).toBe("my tweaks\n");
    expect(existsSync(path.join(root, ".claude/agents/archbook-writer.md"))).toBe(false);
  });

  it("keeps edited files when nobody can be asked", async () => {
    const root = tempProject(USER_FILES);
    const { paths } = await install(root);
    writeFileSync(path.join(root, ".claude/commands/archbook-sync.md"), "changed\n");
    const result = await executeRemoval(paths, planRemoval(paths), { backupDir });
    expect(result.kept).toEqual([".claude/commands/archbook-sync.md"]);
  });

  it("restores a user file that init was allowed to overwrite", async () => {
    const root = tempProject({ ...USER_FILES, ".claude/commands/archbook-generate.md": "mine\n" });
    const before = treeSnapshot(root);
    const { paths } = await install(root, {
      ...defaultsPrompter,
      interactive: true,
      confirm: async () => true,
    });
    await executeRemoval(paths, planRemoval(paths), { backupDir });
    expect(treeSnapshot(root)).toEqual(before);
  });

  it("only plans with --dry-run; nothing changes until executed", async () => {
    const root = tempProject(USER_FILES);
    const { paths } = await install(root);
    const before = treeSnapshot(root);
    const description = describePlan(planRemoval(paths));
    expect(description).toContain("Claude Code assets");
    expect(description).toContain(".gitignore");
    expect(treeSnapshot(root)).toEqual(before);
  });

  it("keeps the documentation with --keep-docs", async () => {
    const root = tempProject(USER_FILES);
    const { paths } = await install(root);
    writeFileSync(paths.architecture, "{}\n");
    await executeRemoval(paths, planRemoval(paths, { keepDocs: true }), { backupDir });
    expect(readdirSync(paths.dir)).toEqual(["architecture.json"]);
    expect(existsSync(path.join(root, ".claude/commands"))).toBe(false);
    expect(existsSync(path.join(root, ".claude/settings.json"))).toBe(true);
  });

  it("falls back to a conservative plan without a manifest", async () => {
    const root = tempProject({ ...USER_FILES, ".claude/commands/deploy.md": "user command\n" });
    const { paths } = await install(root);
    unlinkSync(paths.manifest);
    const plan = planRemoval(paths);
    expect(plan.mode).toBe("conservative");
    const targets = plan.items.map((item) => item.path);
    expect(targets).toContain("archbook");
    expect(targets).toContain(".claude/skills/archbook-schema");
    expect(targets).not.toContain(".claude/commands/deploy.md");
    expect(targets).not.toContain(".gitignore");
  });
});

describe("untrusted manifests", () => {
  /** A project in `<tmp>/project` next to a file the manifest must never reach. */
  function projectWithOutsideFile() {
    const base = tempProject({ "outside.txt": "keep me\n", "project/package.json": "{}\n" });
    const root = path.join(base, "project");
    return { base, root, paths: projectPaths(root) };
  }

  function writeManifest(root: string, entries: unknown[]) {
    const manifest = {
      archbookManifest: 1,
      archbookVersion: "0.1.0",
      updatedAt: "2026-01-01T00:00:00.000Z",
      entries,
    } satisfies Omit<Manifest, "entries"> & { entries: unknown[] };
    mkdirSync(path.join(root, "archbook"), { recursive: true });
    writeFileSync(path.join(root, "archbook/.manifest.json"), JSON.stringify(manifest));
  }

  it("refuses an entry that points outside the project", () => {
    const { base, root, paths } = projectWithOutsideFile();
    writeManifest(root, [{ path: "../outside.txt", change: "created", hash: "sha256:x" }]);
    const before = treeSnapshot(base);
    expect(() => planRemoval(paths)).toThrow(UserError);
    expect(() => planRemoval(paths)).toThrow(/entries\[0\]\.path/);
    expect(treeSnapshot(base)).toEqual(before);
  });

  it("refuses an absolute path, so nothing is written", () => {
    const { base, root, paths } = projectWithOutsideFile();
    const target = path.join(base, "outside.txt");
    writeManifest(root, [
      { path: target, change: "replaced", hash: "sha256:x", original: "pwned\n" },
    ]);
    expect(() => planRemoval(paths)).toThrow(UserError);
    expect(readFileSync(target, "utf8")).toBe("keep me\n");
  });

  it("reports a manifest that is not valid JSON", () => {
    const { base, root, paths } = projectWithOutsideFile();
    mkdirSync(path.join(root, "archbook"), { recursive: true });
    writeFileSync(path.join(root, "archbook/.manifest.json"), "{ not json");
    const before = treeSnapshot(base);
    expect(() => planRemoval(paths)).toThrow(
      /archbook\/\.manifest\.json is invalid.*not valid JSON/,
    );
    expect(treeSnapshot(base)).toEqual(before);
  });

  it("rejects entries of an unknown shape", () => {
    const { root, paths } = projectWithOutsideFile();
    writeManifest(root, [{ path: "a.txt", change: "deleted" }]);
    expect(() => readManifest(paths)).toThrow(UserError);
  });

  it("refuses to execute a plan that leaves the project", async () => {
    const { base, root, paths } = projectWithOutsideFile();
    const before = treeSnapshot(base);
    await expect(
      executeRemoval(
        paths,
        {
          mode: "manifest",
          items: [{ action: "delete", path: "../outside.txt", group: "changes", edited: false }],
        },
        { backupDir },
      ),
    ).rejects.toThrow(/not inside/);
    expect(treeSnapshot(base)).toEqual(before);
    expect(existsSync(root)).toBe(true);
  });
});

describe("project paths", () => {
  it.each([
    ["archbook", true],
    [".claude/commands/archbook-generate.md", true],
    [".gitignore", true],
    [".", false],
    ["", false],
    ["../x", false],
    ["a/../../b", false],
    ["a/../b", false],
    ["./a", false],
    ["a//b", false],
    ["a/", false],
    ["/etc/passwd", false],
    ["C:/x", false],
    ["a\\b", false],
  ])("isSafeProjectPath(%j) is %s", (file, safe) => {
    expect(isSafeProjectPath(file)).toBe(safe);
  });

  it("resolves paths inside the root and refuses the rest", () => {
    const root = tempProject();
    expect(resolveInside(root, "a/b.txt")).toBe(path.join(root, "a/b.txt"));
    expect(resolveInside(root, "a/../b")).toBe(path.join(root, "b"));
    for (const outside of ["a/../../b", "..", ".", "", path.join(tmpdir(), "elsewhere")]) {
      expect(() => resolveInside(root, outside)).toThrow(/not inside/);
    }
  });
});
