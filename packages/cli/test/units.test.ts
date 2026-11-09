import { spawnSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createArchbookShim,
  describeToolUse,
  shellQuote,
  toStreamMessage,
} from "../src/io/claude.js";
import { detectStack, projectDefaults } from "../src/core/detect.js";
import { loadPackageRules, recipesDir } from "../src/core/recipes.js";
import { normalizeRemoteUrl } from "../src/io/git.js";
import { removeAppendedText, textToAppend } from "../src/core/textBlock.js";
import { stripVTControlCharacters } from "node:util";
import { GENERATION_PHASES } from "../src/core/generation/stream.js";
import { commandList, relativeTime, table } from "../src/ui/format.js";
import {
  formatElapsed,
  formatGenerationPlan,
  formatGenerationSummary,
} from "../src/ui/generation.js";
import { repoRoot, tempProject } from "./helpers.js";

describe("textToAppend / removeAppendedText", () => {
  it.each([
    [undefined, "# A\nx/\n"],
    ["", "# A\nx/\n"],
    ["node_modules\n", "\n# A\nx/\n"],
    ["node_modules", "\n\n# A\nx/\n"],
  ])("appends to %j and removes it byte for byte", (existing, expected) => {
    const appended = textToAppend(existing, ["x/"], "# A")!;
    expect(appended).toBe(expected);
    expect(removeAppendedText((existing ?? "") + appended, appended)).toEqual({
      content: existing ?? "",
      exact: true,
    });
  });

  it("adds only missing lines", () => {
    expect(textToAppend("x/\n", ["x/", "y/"], "# A")).toBe("\n# A\ny/\n");
    expect(textToAppend("x/\ny/\n", ["x/", "y/"], "# A")).toBeUndefined();
  });

  it("falls back to removing lines one by one when the block was edited", () => {
    const result = removeAppendedText("a\n# A\nkeep\nx/\n", "\n# A\nx/\n");
    expect(result).toEqual({ content: "a\nkeep\n", exact: false });
  });
});

describe("normalizeRemoteUrl", () => {
  it.each([
    ["git@github.com:owner/repo.git", "https://github.com/owner/repo"],
    ["https://github.com/owner/repo.git", "https://github.com/owner/repo"],
    ["ssh://git@gitlab.com/group/sub/repo.git", "https://gitlab.com/group/sub/repo"],
    ["/local/path", undefined],
  ])("%s", (input, expected) => {
    expect(normalizeRemoteUrl(input)).toBe(expected);
  });
});

describe("detectStack", () => {
  it("recognizes manifests, infrastructure and libraries without reading ignored folders", () => {
    const root = tempProject({
      "package.json": JSON.stringify({
        name: "@acme/shop",
        description: "Shop",
        dependencies: { express: "4", bullmq: "5" },
      }),
      "services/api/Dockerfile": "FROM node",
      "docker-compose.yml": "services: {}",
      "infra/main.tf": "",
      ".github/workflows/ci.yml": "",
      "node_modules/kafkajs/package.json": "{}",
      "vendor/go.mod": "",
    });
    const rules = loadPackageRules(recipesDir(path.join(repoRoot, "plugin")));
    const names = detectStack(root, ["vendor"], rules).map((signal) => signal.name);
    expect(names).toEqual([
      "Node.js",
      "Docker Compose",
      "Docker",
      "Terraform",
      "GitHub Actions",
      "BullMQ",
      "Express",
    ]);
    expect(projectDefaults(root)).toEqual({ name: "shop", description: "Shop" });
  });

  it("reads the description from the README when package.json has none", () => {
    const root = tempProject({
      "README.md": "# Title\n\n![badge](x)\n\nA **tiny** service that sends emails.\n\nMore.",
    });
    expect(projectDefaults(root).description).toBe("A tiny service that sends emails.");
  });
});

describe("ui helpers", () => {
  it("formats relative times", () => {
    const now = new Date("2026-11-08T12:00:00Z");
    expect(relativeTime("2026-11-08T11:59:50Z", now)).toBe("just now");
    expect(relativeTime("2026-11-08T11:30:00Z", now)).toBe("30 min ago");
    expect(relativeTime("2026-11-06T12:00:00Z", now)).toBe("2 days ago");
  });

  it("aligns table columns", () => {
    expect(
      table([
        ["a", "bb", "c"],
        ["ccc", "d", "e"],
      ]),
    ).toBe("a    bb  c\nccc  d   e");
  });

  it("aligns commands and their descriptions", () => {
    expect(
      stripVTControlCharacters(
        commandList([
          ["npx archbook dev", "open the viewer"],
          ["/archbook-sync", "update the docs"],
        ]),
      ),
    ).toBe("  npx archbook dev  open the viewer\n  /archbook-sync    update the docs");
  });

  it.each([
    [0, "0s"],
    [42_400, "42s"],
    [185_000, "3m 05s"],
    [3_720_000, "1h 02m"],
  ])("formats %d ms as %s", (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });

  it("lists the generation passes without the bookkeeping ones", () => {
    const plan = stripVTControlCharacters(formatGenerationPlan(GENERATION_PHASES));
    expect(plan).toMatch(/^1 {2}Mapping components and connections\n2 {2}Tracing flows/);
    expect(plan).not.toMatch(/snapshot\n|Merging/);
    expect(plan).toMatch(/archbook undo/);
  });

  it("summarizes a generation, with warnings only when there are some", () => {
    const base = { nodes: 9, edges: 12, flows: 3, groups: 2, changes: "+9 nodes", elapsedMs: 0 };
    const text = stripVTControlCharacters(
      formatGenerationSummary({ ...base, costUsd: 1.5, warnings: 2 }),
    );
    expect(text).toMatch(/^9 components {2}· {2}12 connections {2}· {2}3 flows {2}· {2}2 groups/);
    expect(text).toMatch(/Time {6}0s · \$1\.50\nWarnings {2}2$/);
    expect(stripVTControlCharacters(formatGenerationSummary({ ...base, warnings: 0 }))).toMatch(
      /Time {5}0s$/,
    );
  });
});

describe("createArchbookShim", () => {
  it("writes a sh script and a .cmd that run this Node with the entry", () => {
    const shim = createArchbookShim("/opt/archbook/dist/index.js");
    try {
      const node = process.execPath;
      expect(readFileSync(path.join(shim.dir, "archbook"), "utf8")).toBe(
        `#!/bin/sh\nexec ${shellQuote(node)} '/opt/archbook/dist/index.js' "$@"\n`,
      );
      expect(readFileSync(path.join(shim.dir, "archbook.cmd"), "utf8")).toBe(
        `@"${node}" "/opt/archbook/dist/index.js" %*\r\n`,
      );
      if (process.platform !== "win32") {
        expect(statSync(path.join(shim.dir, "archbook")).mode & 0o111).toBe(0o111);
      }
    } finally {
      shim.dispose();
    }
    expect(() => statSync(shim.dir)).toThrow();
  });

  it.skipIf(process.platform === "win32")(
    "runs the CLI entry even when its path has spaces, quotes and $",
    () => {
      const root = tempProject({ "it's a $HOME `dir`/entry.mjs": "" });
      const entry = path.join(root, "it's a $HOME `dir`/entry.mjs");
      writeFileSync(entry, 'console.log(["ok", ...process.argv.slice(2)].join(" "));\n');
      const shim = createArchbookShim(entry);
      try {
        const result = spawnSync(path.join(shim.dir, "archbook"), ["--version", "a b"], {
          encoding: "utf8",
        });
        expect(result.stderr).toBe("");
        expect(result.stdout).toBe("ok --version a b\n");
      } finally {
        shim.dispose();
      }
    },
  );
});

describe("toStreamMessage", () => {
  it("keeps well-formed messages", () => {
    const assistant = { type: "assistant", message: { content: [{ type: "text", text: "hi" }] } };
    expect(toStreamMessage(assistant)).toBe(assistant);
    expect(
      toStreamMessage({ type: "system", subtype: "init", slash_commands: ["a"] }),
    ).toBeDefined();
    expect(toStreamMessage({ type: "result", subtype: "success", is_error: false })).toBeDefined();
  });

  it.each([
    null,
    "text",
    [],
    { type: 1 },
    { type: "assistant" },
    { type: "assistant", message: {} },
    { type: "assistant", message: { content: [null] } },
    { type: "system" },
    { type: "system", subtype: "init", slash_commands: [1] },
    { type: "result", subtype: "success" },
    { type: "unknown" },
  ])("drops %j", (value) => {
    expect(toStreamMessage(value)).toBeUndefined();
  });
});

describe("describeToolUse", () => {
  it.each<[string, Record<string, unknown> | undefined, string]>([
    ["Read", { file_path: "src/a.ts" }, "Reading src/a.ts"],
    ["Glob", { pattern: "**/*.ts" }, "Listing **/*.ts"],
    ["Grep", { pattern: "express\\(" }, "Searching for express\\("],
    [
      "Bash",
      { command: "archbook validate --json\necho done" },
      "Running archbook validate --json",
    ],
    ["Edit", { file_path: "archbook/architecture.json" }, "Writing archbook/architecture.json"],
    ["Write", { file_path: "a.json" }, "Writing a.json"],
    ["MultiEdit", { file_path: "b.json" }, "Writing b.json"],
    [
      "Agent",
      { subagent_type: "archbook-scanner", description: "Scan services" },
      "Starting archbook-scanner: Scan services",
    ],
    ["Task", { description: "Scan" }, "Starting subagent: Scan"],
    ["Skill", { skill: "archbook-schema" }, "Loading skill archbook-schema"],
    ["Skill", { name: "archbook-schema" }, "Loading skill archbook-schema"],
    ["Read", { file_path: 42 }, "Reading "],
    ["Read", undefined, "Reading "],
    ["WebFetch", { url: "https://example.com" }, "WebFetch"],
  ])("describes %s %j", (name, input, expected) => {
    expect(describeToolUse(name, input)).toBe(expected);
  });
});
