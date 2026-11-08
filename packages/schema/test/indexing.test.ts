import { describe, expect, it } from "vitest";
import {
  ArchitectureSchema,
  indexArchitecture,
  stepEndpoints,
  type ArchitectureInput,
} from "../src/index.js";
import { baseDocument } from "./fixtures.js";

const parse = (input: ArchitectureInput) => ArchitectureSchema.parse(input);

describe("indexArchitecture", () => {
  it("maps every collection by id", () => {
    const doc = parse(baseDocument());
    const index = indexArchitecture(doc);
    expect([...index.nodes.keys()]).toEqual(["customer", "web", "api", "stripe"]);
    expect([...index.edges.keys()]).toEqual(["customer-to-web", "web-to-api", "api-to-stripe"]);
    expect(index.groups.get("backend")).toBe(doc.groups[0]);
    expect(index.flows.get("checkout")).toBe(doc.flows[0]);
  });

  it("keeps the first item when ids repeat", () => {
    const input = baseDocument();
    input.edges.push({ id: "web-to-api", from: "web", to: "stripe", kind: "queue" });
    const doc = parse(input);
    expect(indexArchitecture(doc).edges.get("web-to-api")).toBe(doc.edges[1]);
  });

  it("lists outgoing and incoming edges in document order", () => {
    const input = baseDocument();
    input.edges.push({ id: "web-to-stripe", from: "web", to: "stripe", kind: "http" });
    const index = indexArchitecture(parse(input));
    const ids = (edges: readonly { id: string }[] | undefined) => edges?.map((edge) => edge.id);
    expect(ids(index.outgoing.get("web"))).toEqual(["web-to-api", "web-to-stripe"]);
    expect(ids(index.incoming.get("stripe"))).toEqual(["api-to-stripe", "web-to-stripe"]);
    expect(index.outgoing.has("stripe")).toBe(false);
    expect(index.incoming.has("customer")).toBe(false);
  });

  it("lists the flow steps that travel each edge", () => {
    const doc = parse(baseDocument());
    const index = indexArchitecture(doc);
    const checkout = doc.flows[0]!;
    expect(index.stepsByEdge.get("web-to-api")).toEqual([
      { flow: checkout, stepIndex: 1 },
      { flow: checkout, stepIndex: 3 },
    ]);
    expect(index.stepsByEdge.get("customer-to-web")).toEqual([{ flow: checkout, stepIndex: 0 }]);
  });

  it("marks groups that hold nodes at any depth", () => {
    const input = baseDocument();
    input.groups = [
      { id: "cloud", name: "Cloud" },
      { id: "backend", name: "Backend", parent: "cloud" },
      { id: "empty", name: "Empty", parent: "cloud" },
      { id: "a", name: "A", parent: "b" },
      { id: "b", name: "B", parent: "a" },
    ];
    input.nodes[0]!.group = "a";
    const index = indexArchitecture(parse(input));
    expect([...index.groupsWithNodes].sort()).toEqual(["a", "b", "backend", "cloud"]);
  });
});

describe("stepEndpoints", () => {
  const doc = parse(baseDocument());
  const index = indexArchitecture(doc);
  const checkout = doc.flows[0]!;

  it("follows the edge direction", () => {
    expect(stepEndpoints(index, checkout, 1)).toEqual({ from: "web", to: "api" });
  });

  it("swaps the ends of reverse steps", () => {
    expect(stepEndpoints(index, checkout, 3)).toEqual({ from: "api", to: "web" });
  });

  it("returns undefined for a missing step or an unknown edge", () => {
    expect(stepEndpoints(index, checkout, 9)).toBeUndefined();
    const broken = parse(baseDocument());
    broken.flows[0]!.steps[0]!.edge = "nowhere";
    expect(stepEndpoints(indexArchitecture(broken), broken.flows[0]!, 0)).toBeUndefined();
  });
});
