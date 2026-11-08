import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFileSystemIndex, validateArchitecture } from "../src/node.js";
import { baseDocument } from "./fixtures.js";

describe("node entry", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "archbook-schema-"));
    mkdirSync(path.join(root, "apps/web"), { recursive: true });
    mkdirSync(path.join(root, "services/api"), { recursive: true });
    writeFileSync(path.join(root, "apps/web/page.tsx"), "one\ntwo\nthree\n");
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("indexes files and directories", () => {
    const index = createFileSystemIndex(root);
    expect(index.lookup("apps/web/page.tsx")).toEqual({ type: "file", lineCount: 3 });
    expect(index.lookup("services/api")).toEqual({ type: "directory" });
    expect(index.lookup("missing.ts")).toBeUndefined();
  });

  it("validates source references against the project root", () => {
    expect(validateArchitecture(baseDocument(), { projectRoot: root }).valid).toBe(true);

    const doc = baseDocument();
    doc.nodes[1]!.sources = [{ path: "apps/web/page.tsx", lines: [2, 4] }];
    const result = validateArchitecture(doc, { projectRoot: root });
    expect(result.errors.map((e) => e.code)).toEqual(["lines-out-of-range"]);
  });
});
