import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createArchbookShim, toStreamMessage } from "../src/lib/claude.js";
import { detectStack, projectDefaults } from "../src/lib/detect.js";
import { normalizeRemoteUrl } from "../src/lib/git.js";
import { removeAppendedText, textToAppend } from "../src/lib/textBlock.js";
import { relativeTime, table } from "../src/lib/ui.js";
import { tempProject } from "./helpers.js";

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
    const names = detectStack(root, ["vendor"]).map((signal) => signal.name);
    expect(names).toEqual([
      "Node.js",
      "Docker Compose",
      "Docker",
      "Terraform",
      "GitHub Actions",
      "Express",
      "BullMQ",
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
});

describe("createArchbookShim", () => {
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
