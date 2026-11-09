import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  commandPrompt,
  planAssets,
  pluginAssetName,
  pluginCommand,
  projectAssetName,
  projectCommand,
  rewriteForProject,
} from "../src/core/assets.js";
import { ALLOWED_TOOLS, ARCHBOOK_BASH_RULES, ARCHBOOK_EDIT_RULES } from "../src/io/claude.js";
import { repoRoot } from "./helpers.js";

const pluginRoot = path.join(repoRoot, "plugin");
const assets = planAssets(pluginRoot);
const known = new Set(assets.map((asset) => asset.name));

function frontmatter(content: string): Record<string, string> {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] ?? "";
  return Object.fromEntries(
    block
      .split("\n")
      .map((line) => /^([a-zA-Z-]+):\s*(.*)$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1]!, m[2]!]),
  );
}

describe("plugin assets", () => {
  it("ships the commands, agents and skills from the brief", () => {
    const names = (kind: string) =>
      [...new Set(assets.filter((a) => a.kind === kind).map((a) => a.name))].sort();
    expect(names("command")).toEqual(["add-flow", "explain", "generate", "sync"]);
    expect(names("agent")).toEqual(["curator", "flow-tracer", "scanner", "validator", "writer"]);
    expect(names("skill")).toEqual(["detection-recipes", "schema", "writing-guide"]);
  });

  it("installs everything under prefixed names in .claude/", () => {
    for (const asset of assets) {
      expect(asset.target).toMatch(/^\.claude\/(commands|agents|skills)\/archbook-/);
    }
    expect(assets.map((a) => a.target)).toContain(
      ".claude/skills/archbook-detection-recipes/recipes/bullmq.md",
    );
  });

  it("gives every command, agent and skill a description, and agents and skills a matching name", () => {
    for (const asset of assets.filter(
      (a) => a.kind !== "skill" || a.target.endsWith("/SKILL.md"),
    )) {
      const meta = frontmatter(asset.content);
      expect(meta.description, asset.target).toBeTruthy();
      if (asset.kind !== "command") expect(meta.name, asset.target).toBe(`archbook-${asset.name}`);
    }
  });

  it("only references commands, agents and skills that exist", () => {
    const markdown = (readdirSync(pluginRoot, { recursive: true }) as string[]).filter((f) =>
      f.endsWith(".md"),
    );
    for (const file of markdown) {
      const source = readFileSync(path.join(pluginRoot, file), "utf8");
      for (const [, name] of source.matchAll(/\barchbook:([a-z0-9-]+)/g)) {
        expect(known.has(name!), `${file} references archbook:${name}`).toBe(true);
      }
    }
  });

  it("rewrites every plugin-mode reference in the copies", () => {
    const reference = new RegExp(`\\barchbook:(${[...known].join("|")})\\b`);
    for (const asset of assets) expect(asset.content, asset.target).not.toMatch(reference);
  });
});

describe("permissions", () => {
  const DESTRUCTIVE = ["remove", "undo", "init", "generate", "build", "dev"];
  const isArchbookRule = (rule: string) => /^Bash\((npx )?archbook\b/.test(rule);

  function checkRules(rules: string[], where: string) {
    expect(rules, where).not.toContain("Bash(archbook *)");
    expect(rules, where).not.toContain("Bash(npx archbook *)");
    for (const rule of rules.filter(isArchbookRule)) {
      for (const sub of DESTRUCTIVE) expect(rule, where).not.toMatch(new RegExp(`\\b${sub}\\b`));
    }
    expect(rules.filter(isArchbookRule).sort(), where).toEqual([...ARCHBOOK_BASH_RULES].sort());
    expect(
      rules.filter((rule) => rule.startsWith("Edit")),
      where,
    ).toEqual(ARCHBOOK_EDIT_RULES);
  }

  it("lets plugin commands run only the safe archbook subcommands and edit only architecture.json and drafts", () => {
    const commands = assets.filter((a) => a.kind === "command" && a.target.endsWith(".md"));
    expect(commands).toHaveLength(4);
    for (const asset of commands) {
      const rules = (frontmatter(asset.content)["allowed-tools"] ?? "")
        .split(/,\s*/)
        .filter(Boolean);
      checkRules(rules, asset.target);
    }
  });

  it("gives the headless session the same archbook rules", () => {
    checkRules(ALLOWED_TOOLS, "ALLOWED_TOOLS");
    expect(ARCHBOOK_EDIT_RULES).toEqual([
      "Edit(./archbook/architecture.json)",
      "Edit(./archbook/.drafts/**)",
    ]);
    expect(ARCHBOOK_BASH_RULES).toEqual(
      expect.arrayContaining(["Bash(archbook merge *)", "Bash(npx archbook format *)"]),
    );
  });
});

describe("rewriteForProject", () => {
  it("prefixes known names and leaves the rest alone", () => {
    const names = new Set(["scanner", "generate"]);
    const input =
      "---\nname: scanner\ndescription: x\n---\nRun /archbook:generate, then archbook:scanner. Not archbook:unknown.";
    expect(rewriteForProject(input, names)).toBe(
      "---\nname: archbook-scanner\ndescription: x\n---\nRun /archbook-generate, then archbook-scanner. Not archbook:unknown.",
    );
  });

  it("extracts a command body as a prompt", () => {
    expect(commandPrompt("---\ndescription: d\n---\nAdd $ARGUMENTS now.\n", "checkout")).toBe(
      "Add checkout now.",
    );
  });
});

describe("asset names", () => {
  it("derives project and plugin names", () => {
    expect(projectAssetName("scanner")).toBe("archbook-scanner");
    expect(pluginAssetName("scanner")).toBe("archbook:scanner");
    expect(projectCommand("generate")).toBe("/archbook-generate");
    expect(pluginCommand("generate")).toBe("/archbook:generate");
  });
});

describe("versions", () => {
  const versionOf = (file: string) =>
    (JSON.parse(readFileSync(path.join(repoRoot, file), "utf8")) as { version: string }).version;

  it("keeps the plugin and every package on the CLI version", () => {
    const cli = versionOf("packages/cli/package.json");
    const packages = readdirSync(path.join(repoRoot, "packages")).map(
      (name) => `packages/${name}/package.json`,
    );
    for (const file of [...packages, "plugin/.claude-plugin/plugin.json"]) {
      expect(versionOf(file), file).toBe(cli);
    }
  });
});
