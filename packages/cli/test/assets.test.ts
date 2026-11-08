import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandPrompt, planAssets, rewriteForProject } from "../src/lib/assets.js";
import { ALLOWED_TOOLS, ARCHBOOK_BASH_RULES, ARCHITECTURE_EDIT_RULE } from "../src/lib/claude.js";
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
    expect(names("agent")).toEqual(["flow-tracer", "scanner", "validator", "writer"]);
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
    ).toEqual([ARCHITECTURE_EDIT_RULE]);
  }

  it("lets plugin commands run only the safe archbook subcommands and edit only architecture.json", () => {
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
    expect(ARCHITECTURE_EDIT_RULE).toBe("Edit(./archbook/architecture.json)");
    expect(ARCHBOOK_BASH_RULES).toContain("Bash(archbook --version *)");
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
