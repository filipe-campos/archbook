import { describe, expect, it } from "vitest";
import { ArchitectureSchema, type Architecture } from "@archbook/schema";
import { buildElements } from "../src/graph/elements";
import {
  emphasisOf,
  flowHighlight,
  selectionHighlight,
  stepEndpoints,
} from "../src/graph/highlight";
import {
  GROUP_PADDING,
  NODE_HEIGHT,
  NODE_WIDTH,
  applyManualPositions,
  groupNodeId,
  layoutArchitecture,
  toElkGraph,
  visibleGroups,
  type Layout,
} from "../src/graph/layout";
import { example } from "./example";

const checkout = example.flows.find((flow) => flow.id === "checkout")!;

describe("layout", () => {
  it("orders groups parents first and hides empty groups", () => {
    const arch: Architecture = {
      ...example,
      groups: [...example.groups, { id: "empty", name: "Empty" }],
    };
    const ids = visibleGroups(arch).map((group) => group.id);
    expect(ids).not.toContain("empty");
    expect(ids.indexOf("aws")).toBeLessThan(ids.indexOf("backend"));
  });

  it("nests groups in the ELK graph in document order", () => {
    const graph = toElkGraph(example);
    expect(graph.children!.map((child) => child.id)).toEqual([
      "customer",
      groupNodeId("vercel"),
      groupNodeId("aws"),
      "stripe",
      "email-service",
    ]);
    const aws = graph.children!.find((child) => child.id === groupNodeId("aws"))!;
    expect(aws.children!.map((child) => child.id)).toEqual([
      groupNodeId("backend"),
      groupNodeId("data"),
    ]);
    expect(graph.edges).toHaveLength(example.edges.length);
  });

  it("lays out every node inside its group", async () => {
    const layout = await layoutArchitecture(example);
    for (const node of example.nodes) {
      const box = layout.get(node.id)!;
      expect(box).toMatchObject({ width: NODE_WIDTH, height: NODE_HEIGHT });
      if (!node.group) continue;
      const group = layout.get(groupNodeId(node.group))!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(group.width);
      expect(box.y + box.height).toBeLessThanOrEqual(group.height);
    }
  });

  it("applies manual positions and grows the enclosing groups", () => {
    const arch = ArchitectureSchema.parse({
      version: "0.1",
      project: { name: "P", description: "" },
      groups: [
        { id: "outer", name: "Outer" },
        { id: "inner", name: "Inner", parent: "outer" },
      ],
      nodes: [
        {
          id: "a",
          kind: "service",
          name: "A",
          summary: "s",
          group: "inner",
          position: { x: 500, y: 300 },
        },
      ],
      edges: [],
    });
    const layout: Layout = new Map([
      [groupNodeId("outer"), { x: 0, y: 0, width: 100, height: 100 }],
      [groupNodeId("inner"), { x: 10, y: 10, width: 50, height: 50 }],
      ["a", { x: 5, y: 5, width: NODE_WIDTH, height: NODE_HEIGHT }],
    ]);
    applyManualPositions(arch, layout);
    expect(layout.get("a")).toMatchObject({ x: 500, y: 300 });
    const inner = layout.get(groupNodeId("inner"))!;
    expect(inner.width).toBe(500 + NODE_WIDTH + GROUP_PADDING.right);
    expect(layout.get(groupNodeId("outer"))!.width).toBe(10 + inner.width + GROUP_PADDING.right);
  });
});

describe("buildElements", () => {
  it("puts parents before children and links nodes to their group", async () => {
    const layout = await layoutArchitecture(example);
    const { nodes, edges } = buildElements(example, layout);
    const index = new Map(nodes.map((node, i) => [node.id, i]));
    for (const node of nodes) {
      if (node.parentId) expect(index.get(node.parentId)!).toBeLessThan(index.get(node.id)!);
    }
    expect(nodes.find((node) => node.id === "orders-api")!.parentId).toBe(groupNodeId("backend"));
    expect(nodes.find((node) => node.id === "customer")!.parentId).toBeUndefined();
    expect(edges.map((edge) => edge.id)).toEqual(example.edges.map((edge) => edge.id));
  });
});

describe("highlight", () => {
  it("follows reverse steps from the edge target", () => {
    const reverseIndex = checkout.steps.findIndex((step) => step.reverse);
    expect(stepEndpoints(example, checkout, reverseIndex)).toEqual({
      from: "orders-api",
      to: "web-app",
    });
  });

  it("marks the current step active, earlier steps visited and the rest dimmed", () => {
    const highlight = flowHighlight(example, checkout, 1, 800);
    expect([...highlight.activeNodes]).toEqual(["web-app", "orders-api"]);
    expect(emphasisOf(highlight, "customer", "node")).toBe("visited");
    expect(emphasisOf(highlight, "customer-to-web-app", "edge")).toBe("visited");
    expect(emphasisOf(highlight, "stripe", "node")).toBe("dimmed");
    expect(highlight.travel).toMatchObject({
      edgeId: "web-app-to-orders-api",
      reverse: false,
      travelMs: 800,
    });
  });

  it("highlights a selected node with its neighbors", () => {
    const highlight = selectionHighlight(example, "redis");
    expect(emphasisOf(highlight, "redis", "node")).toBe("active");
    expect(emphasisOf(highlight, "orders-api", "node")).toBe("visited");
    expect(emphasisOf(highlight, "stripe", "node")).toBe("dimmed");
    expect(selectionHighlight(example, "nope").focused).toBe(false);
  });
});
