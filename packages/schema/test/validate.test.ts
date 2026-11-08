import { describe, expect, it } from "vitest";
import {
  countLines,
  formatIssuePath,
  normalizeSourcePath,
  validateArchitecture,
  validateArchitectureText,
  type ArchitectureInput,
  type IssueCode,
} from "../src/index.js";
import { baseDocument, fullIndex, memoryIndex } from "./fixtures.js";

function codes(doc: ArchitectureInput, sourceFiles = fullIndex) {
  const result = validateArchitecture(doc, { sourceFiles });
  return {
    errors: result.errors.map((issue) => issue.code),
    warnings: result.warnings.map((issue) => issue.code),
    result,
  };
}

function expectSingleError(doc: ArchitectureInput, code: IssueCode, path: string) {
  const { result } = codes(doc);
  expect(result.valid).toBe(false);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]!.code).toBe(code);
  expect(formatIssuePath(result.errors[0]!.path)).toBe(path);
  return result.errors[0]!;
}

describe("validateArchitecture", () => {
  it("accepts a valid document without warnings", () => {
    const { result } = codes(baseDocument());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("applies defaults", () => {
    const { result } = codes(baseDocument());
    const doc = result.architecture!;
    expect(doc.audience).toBe("developers");
    expect(doc.language).toBe("en");
    expect(doc.project.defaultBranch).toBe("main");
    expect(doc.nodes[0]!.tech).toEqual([]);
    expect(doc.flows[0]!.steps[0]!.async).toBe(false);
    expect(doc.flows[0]!.steps[0]!.reverse).toBe(false);
  });

  describe("schema errors", () => {
    it("reports missing fields with their path", () => {
      const doc = baseDocument();
      delete (doc.nodes[0] as Partial<(typeof doc.nodes)[0]>).summary;
      const error = expectSingleError(doc, "schema", "nodes[0].summary");
      expect(error.message).toMatch(/expected string/);
    });

    it("rejects ids that are not kebab-case", () => {
      const doc = baseDocument();
      doc.nodes[1]!.id = "Web_App";
      expectSingleError(doc, "schema", "nodes[1].id");
    });

    const unsafeUrls = ["javascript:alert(1)", "data:text/html,<b>x</b>", "file:///etc/passwd"];

    it.each(unsafeUrls)("rejects the link url %s", (url) => {
      const doc = baseDocument();
      doc.nodes[0]!.links = [{ label: "Docs", url }];
      const error = expectSingleError(doc, "schema", "nodes[0].links[0].url");
      expect(error.message).toMatch(/http or https/);
    });

    it.each(unsafeUrls)("rejects the repoUrl %s", (url) => {
      const doc = baseDocument();
      doc.project.repoUrl = url;
      expectSingleError(doc, "schema", "project.repoUrl");
    });

    it.each(["https://github.com/o/r", "http://localhost:3000/docs", "HTTPS://Example.com"])(
      "accepts the http(s) URL %s",
      (url) => {
        const doc = baseDocument();
        doc.project.repoUrl = url;
        doc.nodes[0]!.links = [{ label: "Docs", url }];
        expect(codes(doc).errors).toEqual([]);
      },
    );

    it("rejects unknown keys so typos are caught", () => {
      const doc = baseDocument();
      (doc.nodes[0] as Record<string, unknown>).sumary = "typo";
      const error = expectSingleError(doc, "schema", "nodes[0]");
      expect(error.message).toContain("sumary");
    });

    it("rejects an inverted line range", () => {
      const doc = baseDocument();
      doc.nodes[1]!.sources = [{ path: "apps/web/page.tsx", lines: [5, 2] }];
      expectSingleError(doc, "schema", "nodes[1].sources[0].lines");
    });

    it("rejects an unsupported version", () => {
      const doc = { ...baseDocument(), version: "0.2" } as unknown as ArchitectureInput;
      expectSingleError(doc, "schema", "version");
    });

    it("rejects a flow without steps", () => {
      const doc = baseDocument();
      doc.flows![0]!.steps = [];
      expectSingleError(doc, "schema", "flows[0].steps");
    });
  });

  describe("semantic errors", () => {
    it.each([
      ["nodes", "web", "nodes[4].id"],
      ["edges", "web-to-api", "edges[3].id"],
      ["groups", "backend", "groups[1].id"],
      ["flows", "checkout", "flows[1].id"],
    ] as const)("reports duplicate %s ids", (key, duplicateOf, path) => {
      const doc = baseDocument();
      const list = doc[key] as Array<{ id: string }>;
      list.push({ ...list.find((item) => item.id === duplicateOf)! });
      const error = expectSingleError(doc, "duplicate-id", path);
      expect(error.message).toContain(`"${duplicateOf}"`);
    });

    it("reports edges pointing to unknown nodes, with a suggestion", () => {
      const doc = baseDocument();
      doc.edges[1]!.to = "apii";
      const error = expectSingleError(doc, "unknown-node", "edges[1].to");
      expect(error.message).toContain('Did you mean "api"?');
    });

    it("reports an unknown edge source node", () => {
      const doc = baseDocument();
      doc.edges[2]!.from = "billing";
      const { errors } = codes(doc);
      expect(errors).toEqual(["unknown-node"]);
    });

    it("reports nodes in unknown groups", () => {
      const doc = baseDocument();
      doc.nodes[2]!.group = "infra";
      expectSingleError(doc, "unknown-group", "nodes[2].group");
    });

    it("reports groups with unknown parents", () => {
      const doc = baseDocument();
      doc.groups!.push({ id: "aws", name: "AWS", parent: "cloud" });
      expectSingleError(doc, "unknown-group", "groups[1].parent");
    });

    it("reports group parent cycles", () => {
      const doc = baseDocument();
      doc.groups = [
        { id: "a", name: "A", parent: "b" },
        { id: "b", name: "B", parent: "a" },
      ];
      doc.nodes[2]!.group = "a";
      const { errors } = codes(doc);
      expect(errors).toEqual(["group-cycle", "group-cycle"]);
    });

    it("reports flow steps with unknown edges", () => {
      const doc = baseDocument();
      doc.flows![0]!.steps[2]!.edge = "api-to-strip";
      const error = expectSingleError(doc, "unknown-edge", "flows[0].steps[2].edge");
      expect(error.message).toContain('Did you mean "api-to-stripe"?');
    });

    it.each([
      ["/etc/passwd", "absolute"],
      ["C:/repo/file.ts", "absolute"],
      ["../outside.ts", "outside the project"],
      ["apps\\web\\page.tsx", "forward slashes"],
    ])("rejects the source path %s", (path, reason) => {
      const doc = baseDocument();
      doc.nodes[1]!.sources = [{ path }];
      const error = expectSingleError(doc, "invalid-source-path", "nodes[1].sources[0].path");
      expect(error.message).toContain(reason);
    });

    it("reports source paths that do not exist on disk", () => {
      const doc = baseDocument();
      doc.edges[0]!.sources = [{ path: "apps/web/missing.tsx" }];
      expectSingleError(doc, "source-not-found", "edges[0].sources[0].path");
    });

    it("normalizes source paths before looking them up", () => {
      const doc = baseDocument();
      doc.nodes[1]!.sources = [{ path: "./apps/web/../web/page.tsx" }];
      expect(codes(doc).errors).toEqual([]);
    });

    it("reports line ranges beyond the end of the file", () => {
      const doc = baseDocument();
      doc.nodes[1]!.sources = [{ path: "apps/web/page.tsx", lines: [8, 11] }];
      const error = expectSingleError(doc, "lines-out-of-range", "nodes[1].sources[0].lines");
      expect(error.message).toContain("10 lines");
    });

    it("reports line ranges on directories", () => {
      const doc = baseDocument();
      doc.nodes[2]!.sources = [{ path: "services/api", lines: [1, 2] }];
      expectSingleError(doc, "lines-out-of-range", "nodes[2].sources[0].lines");
    });

    it("skips disk checks when no source index is given", () => {
      const doc = baseDocument();
      doc.nodes[1]!.sources = [{ path: "nowhere.ts", lines: [1, 999] }];
      expect(validateArchitecture(doc).valid).toBe(true);
    });
  });

  describe("warnings", () => {
    it("warns about nodes without edges", () => {
      const doc = baseDocument();
      doc.nodes.push({
        id: "cron",
        kind: "worker",
        name: "Cron",
        summary: "Nightly job.",
        sources: [{ path: "services/api" }],
      });
      const { errors, warnings } = codes(doc);
      expect(errors).toEqual([]);
      expect(warnings).toEqual(["isolated-node"]);
    });

    it("warns about nodes without sources, except externals and actors", () => {
      const doc = baseDocument();
      doc.nodes[2]!.sources = [];
      const { result } = codes(doc);
      expect(result.warnings.map((w) => [w.code, formatIssuePath(w.path)])).toEqual([
        ["node-without-sources", "nodes[2].sources"],
      ]);
    });

    it("warns when a step starts at a node the flow has not reached", () => {
      const doc = baseDocument();
      doc.nodes.push({
        id: "worker",
        kind: "worker",
        name: "W",
        summary: "s",
        sources: [{ path: "services/api" }],
      });
      doc.edges.push({ id: "worker-to-stripe", from: "worker", to: "stripe", kind: "http" });
      doc.flows![0]!.steps.push({ edge: "worker-to-stripe", title: "Retries" });
      const { result } = codes(doc);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe("discontinuous-flow");
      expect(formatIssuePath(result.warnings[0]!.path)).toBe("flows[0].steps[4]");
    });

    it("does not warn when the discontinuous step is async", () => {
      const doc = baseDocument();
      doc.nodes.push({
        id: "worker",
        kind: "worker",
        name: "W",
        summary: "s",
        sources: [{ path: "services/api" }],
      });
      doc.edges.push({ id: "worker-to-stripe", from: "worker", to: "stripe", kind: "queue" });
      doc.flows![0]!.steps.push({ edge: "worker-to-stripe", title: "Retries", async: true });
      expect(codes(doc).warnings).toEqual([]);
    });

    it("follows reverse steps from the edge target", () => {
      const doc = baseDocument();
      doc.flows![0]!.steps = [
        { edge: "web-to-api", title: "Request" },
        { edge: "web-to-api", title: "Response", reverse: true },
        { edge: "customer-to-web", title: "Customer sees result", reverse: true },
      ];
      expect(codes(doc).warnings).toEqual([]);
    });
  });
});

describe("validateArchitectureText", () => {
  it("reports invalid JSON", () => {
    const result = validateArchitectureText("{ nope");
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.code).toBe("invalid-json");
  });

  it("validates parsed JSON", () => {
    const result = validateArchitectureText(JSON.stringify(baseDocument()), {
      sourceFiles: memoryIndex({}),
    });
    expect(result.errors.map((e) => e.code)).toEqual(["source-not-found", "source-not-found"]);
  });
});

describe("helpers", () => {
  it("counts lines like an editor does", () => {
    expect(countLines("")).toBe(0);
    expect(countLines("a")).toBe(1);
    expect(countLines("a\n")).toBe(1);
    expect(countLines("a\nb")).toBe(2);
    expect(countLines("a\n\n")).toBe(2);
  });

  it("normalizes relative paths", () => {
    expect(normalizeSourcePath("./a//b/./c")).toEqual({ ok: true, path: "a/b/c" });
    expect(normalizeSourcePath("a/../..")).toMatchObject({ ok: false });
    expect(normalizeSourcePath(".")).toEqual({ ok: true, path: "." });
  });

  it("formats issue paths", () => {
    expect(formatIssuePath(["nodes", 2, "sources", 0, "path"])).toBe("nodes[2].sources[0].path");
    expect(formatIssuePath([])).toBe("(root)");
  });
});
