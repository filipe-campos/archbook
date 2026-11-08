import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatArchitecture, type ArchitectureInput } from "@archbook/schema";
import { applyDraft, mergeDraft, parseDraft } from "../src/core/merge.js";
import { projectPaths } from "../src/core/project.js";
import { UserError } from "../src/errors.js";
import { MINIMAL_SOURCES, tempProject } from "./helpers.js";

function current(): ArchitectureInput {
  return {
    version: "0.1",
    project: { name: "Shop" },
    groups: [{ id: "backend", name: "Backend" }],
    nodes: [
      { id: "user", kind: "actor", name: "User", summary: "Buys." },
      {
        id: "api",
        kind: "service",
        name: "API",
        summary: "Orders.",
        group: "backend",
        sources: [{ path: "src/server.ts" }],
        owner: "Team A",
        links: [{ label: "Runbook", url: "https://example.com" }],
        position: { x: 1, y: 2 },
      },
      { id: "db", kind: "database", name: "DB", summary: "Stores." },
    ],
    edges: [
      { id: "user-to-api", from: "user", to: "api", kind: "http" },
      { id: "api-to-db", from: "api", to: "db", kind: "db" },
    ],
    flows: [
      {
        id: "checkout",
        name: "Checkout",
        summary: "Pays.",
        trigger: "Click",
        steps: [{ edge: "user-to-api", title: "Orders" }],
      },
    ],
  };
}

const merge = (
  draft: unknown,
  options: { replaceStructure?: boolean } = {},
  doc: unknown = current(),
) => mergeDraft(doc, parseDraft(draft), options);

const ids = (items: unknown) => (items as Array<{ id: string }>).map((item) => item.id);

describe("scanner drafts with --replace-structure", () => {
  const draft = {
    groups: [{ id: "backend", name: "Backend services" }],
    nodes: [
      { id: "user", kind: "actor", name: "User", summary: "Buys." },
      { id: "api", kind: "service", name: "Orders API", summary: "Takes orders.", owner: "Draft" },
      { id: "cache", kind: "cache", name: "Cache", summary: "Caches." },
    ],
    edges: [
      { id: "user-to-api", from: "user", to: "api", kind: "http" },
      { id: "api-to-cache", from: "api", to: "cache", kind: "cache" },
    ],
    notes: ["db is gone: no client left in src/"],
  };

  it("replaces groups, nodes and edges and keeps flows", () => {
    const { document, report } = merge(draft, { replaceStructure: true });
    expect(ids(document.nodes)).toEqual(["user", "api", "cache"]);
    expect(ids(document.edges)).toEqual(["user-to-api", "api-to-cache"]);
    expect(document.groups).toEqual(draft.groups);
    expect(ids(document.flows)).toEqual(["checkout"]);
    expect(report.added).toMatchObject({ groups: [], nodes: ["cache"], edges: ["api-to-cache"] });
    expect(report.removed).toEqual({ groups: [], nodes: ["db"], edges: ["api-to-db"] });
  });

  it("carries owner, links and position over for kept ids", () => {
    const { document, report } = merge(draft, { replaceStructure: true });
    expect((document.nodes as unknown[])[1]).toEqual({
      id: "api",
      kind: "service",
      name: "Orders API",
      summary: "Takes orders.",
      owner: "Team A",
      links: [{ label: "Runbook", url: "https://example.com" }],
      position: { x: 1, y: 2 },
    });
    expect(report.preserved).toEqual(["api"]);
  });

  it("sets the document fields the draft carries and starts a missing document", () => {
    const header = {
      version: "0.1",
      project: { name: "New" },
      generatedAt: "2026-11-08T12:00:00Z",
      generatedBy: "archbook@0.1.0 + claude-code",
    };
    const { document } = merge({ ...header, ...draft }, { replaceStructure: true }, null);
    expect(document).toMatchObject({ ...header, flows: [] });
    expect(ids(document.nodes)).toEqual(["user", "api", "cache"]);
  });

  it("rejects a flow draft", () => {
    expect(() => merge({ flow: { id: "f", steps: [] } }, { replaceStructure: true })).toThrow(
      UserError,
    );
  });
});

describe("scanner drafts without --replace-structure", () => {
  it("adds only new ids and reuses edges with the same endpoints and kind", () => {
    const { document, report } = merge({
      nodes: [
        { id: "api", kind: "service", name: "Changed", summary: "Ignored." },
        { id: "cache", kind: "cache", name: "Cache", summary: "Caches." },
      ],
      edges: [
        { id: "api-calls-db", from: "api", to: "db", kind: "db" },
        { id: "api-to-cache", from: "api", to: "cache", kind: "cache" },
      ],
    });
    expect((document.nodes as Array<{ name: string }>)[1]!.name).toBe("API");
    expect(ids(document.nodes)).toEqual(["user", "api", "db", "cache"]);
    expect(ids(document.edges)).toEqual(["user-to-api", "api-to-db", "api-to-cache"]);
    expect(report.reused).toEqual([
      { type: "node", id: "api", existing: "api" },
      { type: "edge", id: "api-calls-db", existing: "api-to-db" },
    ]);
    expect(report.added.edges).toEqual(["api-to-cache"]);
  });
});

describe("flow drafts", () => {
  const flow = (steps: Array<{ edge: string; title: string }>, id = "refund") => ({
    id,
    name: "Refund",
    summary: "Refunds.",
    trigger: "Support clicks Refund",
    steps,
  });

  it("reuses an existing edge with the same from, to and kind and remaps the steps", () => {
    const { document, report } = merge({
      flow: flow([{ edge: "api-writes-db", title: "Saves" }]),
      newEdges: [{ id: "api-writes-db", from: "api", to: "db", kind: "db", label: "UPDATE" }],
    });
    expect(ids(document.edges)).toEqual(["user-to-api", "api-to-db"]);
    expect(document).toHaveProperty("flows.1.steps.0.edge", "api-to-db");
    expect(report.reused).toEqual([{ type: "edge", id: "api-writes-db", existing: "api-to-db" }]);
    expect(report.added.flows).toEqual(["refund"]);
  });

  it("renames an edge whose id is taken by different endpoints and remaps the steps", () => {
    const { document, report } = merge({
      flow: flow([
        { edge: "api-to-db", title: "Reads" },
        { edge: "api-to-db", title: "Reads again" },
      ]),
      newEdges: [{ id: "api-to-db", from: "api", to: "db", kind: "cache" }],
    });
    expect(ids(document.edges)).toEqual(["user-to-api", "api-to-db", "api-to-db-2"]);
    expect(report.renamed).toEqual([{ from: "api-to-db", to: "api-to-db-2" }]);
    const steps = (document.flows as Array<{ steps: Array<{ edge: string }> }>)[1]!.steps;
    expect(steps.map((step) => step.edge)).toEqual(["api-to-db-2", "api-to-db-2"]);
  });

  it("counts up until the id is free", () => {
    const doc = current();
    doc.edges.push({ id: "api-to-db-2", from: "db", to: "api", kind: "db" });
    const { report } = merge(
      {
        flow: flow([{ edge: "api-to-db", title: "x" }]),
        newEdges: [{ id: "api-to-db", from: "user", to: "db", kind: "db" }],
      },
      {},
      doc,
    );
    expect(report.renamed).toEqual([{ from: "api-to-db", to: "api-to-db-3" }]);
  });

  it("adds new nodes and skips ids that exist", () => {
    const { document, report } = merge({
      flow: flow([{ edge: "api-to-stripe", title: "Refunds" }]),
      newNodes: [
        { id: "stripe", kind: "external", name: "Stripe", summary: "Payments." },
        { id: "db", kind: "database", name: "Other", summary: "Duplicate." },
      ],
      newEdges: [{ id: "api-to-stripe", from: "api", to: "stripe", kind: "http" }],
    });
    expect(ids(document.nodes)).toEqual(["user", "api", "db", "stripe"]);
    expect((document.nodes as Array<{ name: string }>)[2]!.name).toBe("DB");
    expect(report.added.nodes).toEqual(["stripe"]);
    expect(report.reused).toContainEqual({ type: "node", id: "db", existing: "db" });
  });

  it("replaces the flow with the same id in place", () => {
    const { document, report } = merge({
      flow: flow([{ edge: "user-to-api", title: "Orders twice" }], "checkout"),
    });
    expect(ids(document.flows)).toEqual(["checkout"]);
    expect(document).toHaveProperty("flows.0.steps.0.title", "Orders twice");
    expect(report.replaced).toEqual(["checkout"]);
    expect(report.added.flows).toEqual([]);
  });

  it("does not change the input document", () => {
    const doc = current();
    const before = JSON.stringify(doc);
    merge(
      {
        flow: flow([{ edge: "x", title: "x" }]),
        newEdges: [{ id: "x", from: "a", to: "b", kind: "db" }],
      },
      {},
      doc,
    );
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe("parseDraft", () => {
  it.each([
    ["an unknown top-level key", { nodes: [], extra: 1 }],
    ["an edge without endpoints", { edges: [{ id: "e" }] }],
    ["a flow without steps", { flow: { id: "f" } }],
    ["a string", "draft"],
  ])("rejects %s", (_name, draft) => {
    expect(() => parseDraft(draft)).toThrow(/^Invalid draft: /);
  });
});

describe("applyDraft", () => {
  const project = () => {
    const root = tempProject({
      ...MINIMAL_SOURCES,
      "archbook/architecture.json": `${JSON.stringify(current())}\n`,
    });
    const paths = projectPaths(root);
    mkdirSync(paths.drafts, { recursive: true });
    return paths;
  };
  const writeDraft = (dir: string, draft: unknown, name = "tracer.json") => {
    const file = path.join(dir, name);
    writeFileSync(file, JSON.stringify(draft));
    return file;
  };

  it("validates, writes the formatted document and deletes the draft", () => {
    const paths = project();
    const file = writeDraft(paths.drafts, {
      flow: {
        id: "restock",
        name: "Restock",
        summary: "s",
        trigger: "t",
        steps: [{ edge: "api-to-db", title: "Writes", async: false }],
      },
    });
    const result = applyDraft(paths, file);
    expect(result.written).toBe(true);
    expect(result.draft).toBe("archbook/.drafts/tracer.json");
    expect(result.validation.valid).toBe(true);
    const text = readFileSync(paths.architecture, "utf8");
    expect(text).toBe(formatArchitecture(JSON.parse(text) as ArchitectureInput));
    expect(text).not.toContain('"async"');
    expect(existsSync(file)).toBe(false);
  });

  it("writes a document with semantic errors and reports them", () => {
    const paths = project();
    const file = writeDraft(paths.drafts, {
      flow: {
        id: "ghost",
        name: "G",
        summary: "s",
        trigger: "t",
        steps: [{ edge: "nope", title: "x" }],
      },
    });
    const result = applyDraft(paths, file);
    expect(result.written).toBe(true);
    expect(result.validation.errors.map((issue) => issue.code)).toEqual(["unknown-edge"]);
  });

  it("writes nothing and keeps the draft when the result fails the schema", () => {
    const paths = project();
    const before = readFileSync(paths.architecture, "utf8");
    const file = writeDraft(paths.drafts, {
      nodes: [{ id: "Bad Id", kind: "service", name: "x", summary: "x" }],
    });
    const result = applyDraft(paths, file);
    expect(result.written).toBe(false);
    expect(result.validation.errors[0]!.code).toBe("schema");
    expect(readFileSync(paths.architecture, "utf8")).toBe(before);
    expect(existsSync(file)).toBe(true);
  });

  it("refuses drafts outside archbook/.drafts/", () => {
    const paths = project();
    const file = writeDraft(paths.root, { nodes: [] }, "draft.json");
    expect(() => applyDraft(paths, file)).toThrow(/Drafts must be inside archbook\/\.drafts\//);
    expect(() => applyDraft(paths, paths.drafts)).toThrow(UserError);
    expect(existsSync(file)).toBe(true);
  });

  it("reports a missing or unreadable draft", () => {
    const paths = project();
    expect(() => applyDraft(paths, path.join(paths.drafts, "none.json"))).toThrow(
      "Draft archbook/.drafts/none.json does not exist.",
    );
    writeFileSync(path.join(paths.drafts, "bad.json"), "{");
    expect(() => applyDraft(paths, path.join(paths.drafts, "bad.json"))).toThrow(
      /archbook\/\.drafts\/bad\.json is not valid JSON/,
    );
  });
});
