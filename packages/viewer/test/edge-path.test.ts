import { describe, expect, it } from "vitest";
import { longestRunMiddle, roundedPath } from "../src/graph/edgePath";
import { edgeRoutes, labelWidth, layoutArchitecture } from "../src/graph/layout";
import { example } from "./example";

describe("roundedPath", () => {
  it("draws straight segments and rounds each corner", () => {
    expect(
      roundedPath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ]),
    ).toBe("M 0 0 L 86 0 Q 100 0 100 14 L 100 100");
  });

  it("shrinks the radius on short segments", () => {
    expect(
      roundedPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toBe("M 0 0 L 5 0 Q 10 0 10 5 L 10 10");
  });

  it("handles empty and single-point routes", () => {
    expect(roundedPath([])).toBe("");
    expect(roundedPath([{ x: 3, y: 4 }])).toBe("M 3 4");
  });
});

describe("longestRunMiddle", () => {
  it("prefers the longest horizontal segment", () => {
    expect(
      longestRunMiddle([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 300 },
        { x: 140, y: 300 },
      ]),
    ).toEqual({ x: 90, y: 300 });
  });

  it("falls back to the first point for degenerate routes", () => {
    expect(longestRunMiddle([{ x: 5, y: 5 }])).toEqual({ x: 5, y: 5 });
    expect(longestRunMiddle([])).toEqual({ x: 0, y: 0 });
  });
});

describe("edge routes", () => {
  it("routes every drawable edge of the example and places each label on it", async () => {
    const { routes } = await layoutArchitecture(example);
    for (const edge of example.edges) {
      const route = routes.get(edge.id)!;
      expect(route.points.length).toBeGreaterThanOrEqual(2);
      if (edge.label) expect(route.label?.width).toBe(labelWidth(edge.label));
    }
  });

  it("skips edges that touch a node placed by hand", () => {
    const [moved] = example.nodes;
    const arch = {
      ...example,
      nodes: example.nodes.map((node) =>
        node.id === moved!.id ? { ...node, position: { x: 0, y: 0 } } : node,
      ),
    };
    const touching = example.edges.filter(
      (edge) => edge.from === moved!.id || edge.to === moved!.id,
    );
    const result = {
      id: "root",
      edges: example.edges.map((edge) => ({
        id: edge.id,
        sources: [edge.from],
        targets: [edge.to],
        sections: [{ id: "s", startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } }],
      })),
    };
    const routes = edgeRoutes(arch, result);
    expect(touching.length).toBeGreaterThan(0);
    for (const edge of touching) expect(routes.has(edge.id)).toBe(false);
    expect(routes.size).toBe(example.edges.length - touching.length);
  });
});
