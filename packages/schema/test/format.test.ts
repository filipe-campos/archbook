import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_SCHEMA_URL,
  ArchitectureSchema,
  formatArchitecture,
  type ArchitectureInput,
} from "../src/index.js";
import { baseDocument } from "./fixtures.js";

const example = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../../examples/shop-checkout/archbook/architecture.json"),
    "utf8",
  ),
) as ArchitectureInput;

const reverseKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reverseKeys(item)]),
  );
};

const keys = (value: unknown) => Object.keys(value as object);

describe("formatArchitecture", () => {
  it.each([
    ["the example", example],
    ["the base fixture", baseDocument()],
    ["a fixture with every field", reverseKeys(fullDocument()) as ArchitectureInput],
  ])("keeps %s equivalent and is idempotent", (_name, doc) => {
    const text = formatArchitecture(doc);
    expect(ArchitectureSchema.parse(JSON.parse(text))).toEqual(ArchitectureSchema.parse(doc));
    expect(formatArchitecture(JSON.parse(text) as ArchitectureInput)).toBe(text);
  });

  it("orders keys as the schema documents them", () => {
    const formatted = JSON.parse(
      formatArchitecture(reverseKeys(fullDocument()) as ArchitectureInput),
    ) as Record<string, Record<string, unknown>[]>;
    expect(keys(formatted)).toEqual([
      "$schema",
      "version",
      "project",
      "audience",
      "language",
      "groups",
      "nodes",
      "edges",
      "flows",
      "generatedAt",
      "generatedBy",
    ]);
    expect(keys(formatted.project)).toEqual(["name", "description", "repoUrl", "defaultBranch"]);
    expect(keys(formatted.groups![1])).toEqual(["id", "name", "description", "parent"]);
    const node = formatted.nodes![1]!;
    expect(keys(node)).toEqual([
      "id",
      "kind",
      "name",
      "summary",
      "description",
      "tech",
      "group",
      "sources",
      "owner",
      "links",
      "position",
    ]);
    expect(keys((node.sources as unknown[])[0])).toEqual(["path", "symbol", "lines"]);
    expect(keys(formatted.edges![0])).toEqual([
      "id",
      "from",
      "to",
      "kind",
      "label",
      "description",
      "sources",
    ]);
    const flow = formatted.flows![0]!;
    expect(keys(flow)).toEqual(["id", "name", "summary", "trigger", "steps"]);
    expect(keys((flow.steps as unknown[])[0])).toEqual([
      "edge",
      "title",
      "description",
      "payload",
      "durationMs",
      "async",
      "reverse",
    ]);
  });

  it("leaves out empty arrays, empty optional strings and false booleans", () => {
    const doc = baseDocument();
    doc.project.description = "";
    doc.groups = [];
    doc.nodes[0] = { ...doc.nodes[0]!, description: "", tech: [], sources: [], links: [] };
    doc.edges[0] = { ...doc.edges[0]!, label: "", sources: [] };
    doc.flows![0]!.steps[0] = { ...doc.flows![0]!.steps[0]!, async: false, reverse: false };
    const formatted = JSON.parse(formatArchitecture(doc)) as Record<string, never>;

    expect(formatted).not.toHaveProperty("groups");
    expect(formatted).toHaveProperty("project", { name: "Shop" });
    expect(formatted).toHaveProperty("nodes.0", {
      id: "customer",
      kind: "actor",
      name: "Customer",
      summary: "Buys things.",
    });
    expect(formatted).toHaveProperty("edges.0", {
      id: "customer-to-web",
      from: "customer",
      to: "web",
      kind: "http",
    });
    expect(formatted).toHaveProperty("flows.0.steps.0", {
      edge: "customer-to-web",
      title: "Clicks pay",
    });
  });

  it("keeps required arrays, true booleans and payloads as they are", () => {
    const doc = baseDocument();
    doc.groups = [];
    doc.nodes = [];
    doc.edges = [];
    doc.flows = [
      {
        id: "empty",
        name: "Empty",
        summary: "s",
        trigger: "t",
        steps: [
          { edge: "e", title: "t", payload: { items: [], ok: false, note: "" }, async: true },
        ],
      },
    ];
    const formatted = JSON.parse(formatArchitecture(doc)) as Record<string, unknown>;
    expect(formatted.nodes).toEqual([]);
    expect(formatted.edges).toEqual([]);
    expect(formatted).toHaveProperty("flows.0.steps.0", {
      edge: "e",
      title: "t",
      payload: { items: [], ok: false, note: "" },
      async: true,
    });
    expect(formatArchitecture({ ...doc, flows: [] })).not.toContain('"flows"');
  });

  it("uses 2-space indentation and ends with a newline", () => {
    const text = formatArchitecture(baseDocument());
    expect(text.startsWith('{\n  "version": "0.1",\n  "project": {\n    "name"')).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("keeps keys the schema does not know, after the known ones", () => {
    const doc = { extra: 1, ...baseDocument() } as ArchitectureInput;
    expect(keys(JSON.parse(formatArchitecture(doc))).at(-1)).toBe("extra");
  });
});

function fullDocument(): ArchitectureInput {
  return {
    $schema: ARCHITECTURE_SCHEMA_URL,
    version: "0.1",
    project: {
      name: "Shop",
      description: "Online shop",
      repoUrl: "https://github.com/o/r",
      defaultBranch: "main",
    },
    audience: "mixed",
    language: "pt-BR",
    groups: [
      { id: "cloud", name: "Cloud" },
      { id: "backend", name: "Backend", description: "APIs.", parent: "cloud" },
    ],
    nodes: [
      { id: "customer", kind: "actor", name: "Customer", summary: "Buys things." },
      {
        id: "api",
        kind: "service",
        name: "API",
        summary: "Orders API.",
        description: "Handles **orders**.",
        tech: ["Node.js"],
        group: "backend",
        sources: [{ path: "services/api/main.ts", symbol: "main", lines: [1, 9] }],
        owner: "Team A",
        links: [{ label: "Runbook", url: "https://example.com/runbook" }],
        position: { x: 10, y: 20 },
      },
    ],
    edges: [
      {
        id: "customer-to-api",
        from: "customer",
        to: "api",
        kind: "http",
        label: "POST /orders",
        description: "Creates an order.",
        sources: [{ path: "services/api/main.ts" }],
      },
    ],
    flows: [
      {
        id: "checkout",
        name: "Checkout",
        summary: "Customer pays.",
        trigger: "Customer clicks Pay",
        steps: [
          {
            edge: "customer-to-api",
            title: "Creates order",
            description: "Sends the cart.",
            payload: { items: 2 },
            durationMs: 120,
            async: true,
            reverse: true,
          },
        ],
      },
    ],
    generatedAt: "2026-11-08T12:00:00Z",
    generatedBy: "archbook@0.1.0 + claude-code",
  };
}
