import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ISSUE_CODES, SCHEMA_VERSION } from "../src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), "utf8");

const codes = Object.keys(ISSUE_CODES).sort();
const CODE_DOCS = ["docs/schema.md", "plugin/skills/schema/SKILL.md", "plugin/agents/validator.md"];

/** Text between a heading and the next heading of the same or a higher level. */
function section(text: string, heading: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) throw new Error(`Missing heading "${heading}"`);
  const level = /^#+/.exec(heading)![0].length;
  const end = lines.findIndex(
    (line, index) => index > start && /^#+ /.test(line) && /^#+/.exec(line)![0].length <= level,
  );
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
}

/** First-cell codes of Markdown table rows, with the remaining cells. */
function codeRows(text: string): Array<{ code: string; cells: string[] }> {
  return [...text.matchAll(/^\|\s*`([a-z-]+)`\s*\|(.*)\|\s*$/gm)].map((match) => ({
    code: match[1]!,
    cells: match[2]!.split("|").map((cell) => cell.trim()),
  }));
}

/** Codes listed by the validator agent: leading a fix bullet, or opening the warnings section. */
function validatorCodes(text: string): string[] {
  const bullets = [...text.matchAll(/^\s+- ((?:`[a-z-]+`(?:, )?)+):/gm)].flatMap((match) =>
    [...match[1]!.matchAll(/`([a-z-]+)`/g)].map((code) => code[1]!),
  );
  const leadingList = /^(?:`[a-z-]+`(?:,? and |, )?)+/.exec(section(text, "## Warnings").trim());
  const warnings = [...(leadingList?.[0] ?? "").matchAll(/`([a-z-]+)`/g)].map((code) => code[1]!);
  return [...bullets, ...warnings];
}

describe("validation codes in the docs", () => {
  it.each(CODE_DOCS)("%s mentions every code", (file) => {
    const text = read(file);
    for (const code of codes) expect(text, code).toContain(`\`${code}\``);
  });

  it("docs/schema.md lists exactly the codes, under their severity", () => {
    const validation = section(read("docs/schema.md"), "## Validation");
    const listed = (heading: string) =>
      codeRows(section(validation, heading))
        .map((row) => row.code)
        .sort();
    const bySeverity = (severity: string) =>
      codes.filter((code) => ISSUE_CODES[code as keyof typeof ISSUE_CODES].severity === severity);
    expect(listed("### Errors")).toEqual(bySeverity("error"));
    expect(listed("### Warnings")).toEqual(bySeverity("warning"));
  });

  it("the schema skill lists exactly the codes, with their severity", () => {
    const rows = codeRows(section(read("plugin/skills/schema/SKILL.md"), "## Validation codes"));
    expect(rows.map((row) => row.code).sort()).toEqual(codes);
    for (const { code, cells } of rows) {
      expect(cells[0], code).toBe(ISSUE_CODES[code as keyof typeof ISSUE_CODES].severity);
    }
  });

  it("the validator agent lists exactly the codes", () => {
    expect([...new Set(validatorCodes(read("plugin/agents/validator.md")))].sort()).toEqual(codes);
  });
});

describe("schema version in the docs", () => {
  const files = [
    "README.md",
    "docs/schema.md",
    "plugin/skills/schema/SKILL.md",
    ...readdirSync(path.join(repoRoot, "plugin/commands"))
      .filter((file) => file.endsWith(".md"))
      .map((file) => `plugin/commands/${file}`),
  ];

  it.each(files)("%s uses the current version in schema URLs", (file) => {
    const versions = [...read(file).matchAll(/unpkg\.com\/archbook@([^/]+)\/schema\//g)];
    for (const [url, version] of versions) expect(version, url).toBe(SCHEMA_VERSION);
  });

  it.each(files)("%s uses the current version in JSON examples", (file) => {
    const versions = [...read(file).matchAll(/"?version"?: "([^"]*)"/g)];
    for (const [example, version] of versions) expect(version, example).toBe(SCHEMA_VERSION);
  });

  it("finds the URLs and examples it checks", () => {
    const all = files.map(read).join("\n");
    expect(all).toMatch(/unpkg\.com\/archbook@[^/]+\/schema\/architecture\.schema\.json/);
    expect(all).toMatch(/unpkg\.com\/archbook@[^/]+\/schema\/config\.schema\.json/);
    expect(all).toMatch(/"version": "/);
  });
});
