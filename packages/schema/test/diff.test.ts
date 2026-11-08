import { describe, expect, it } from "vitest";
import { diffArchitecture, stableStringify, summarizeDiff } from "../src/index.js";
import { baseDocument } from "./fixtures.js";

describe("diffArchitecture", () => {
  it("reports created and deleted files", () => {
    const doc = baseDocument();
    const created = diffArchitecture(null, doc);
    expect(created.status).toBe("created");
    expect(created.nodes.added).toEqual(["customer", "web", "api", "stripe"]);
    expect(summarizeDiff(created)).toBe("file created (+4 nodes, +3 edges, +1 flow, +1 group)");

    expect(diffArchitecture(doc, null).status).toBe("deleted");
    expect(summarizeDiff(diffArchitecture(doc, null))).toBe("file deleted");
  });

  it("ignores key order and volatile fields", () => {
    const a = baseDocument();
    const b = JSON.parse(JSON.stringify(a)) as typeof a;
    b.nodes[0] = Object.fromEntries(Object.entries(a.nodes[0]!).reverse()) as (typeof a.nodes)[0];
    b.generatedAt = "2026-01-01T00:00:00Z";
    const diff = diffArchitecture(a, b);
    expect(diff.status).toBe("unchanged");
    expect(summarizeDiff(diff)).toBe("no changes");
  });

  it("reports added, removed and changed items with their fields", () => {
    const a = baseDocument();
    const b = baseDocument();
    b.nodes.push({ id: "redis", kind: "cache", name: "Redis", summary: "Cache." });
    b.nodes.push({ id: "postgres", kind: "database", name: "Postgres", summary: "DB." });
    b.flows = [];
    b.nodes[1]!.description = "Next.js storefront.";
    b.edges[0]!.label = "HTTPS";
    b.project.description = "Changed";

    const diff = diffArchitecture(a, b);
    expect(diff.status).toBe("modified");
    expect(diff.nodes.added).toEqual(["redis", "postgres"]);
    expect(diff.flows.removed).toEqual(["checkout"]);
    expect(diff.nodes.changed).toEqual([{ id: "web", fields: ["description"] }]);
    expect(diff.edges.changed).toEqual([{ id: "customer-to-web", fields: ["label"] }]);
    expect(diff.metadata).toEqual(["project"]);
    expect(summarizeDiff(diff)).toBe(
      "+2 nodes, -1 flow, 1 node changed, 1 edge changed, project changed",
    );
  });

  it("tolerates documents that are not valid architectures", () => {
    const diff = diffArchitecture({ nodes: "nope" }, { nodes: [{ id: "a" }, { name: "no id" }] });
    expect(diff.nodes.added).toEqual(["a"]);
  });
});

describe("stableStringify", () => {
  it("sorts keys and drops undefined values", () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
  });
});
