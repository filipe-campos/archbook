import { describe, expect, it } from "vitest";
import {
  ArchitectureSchema,
  indexArchitecture,
  stepEndpoints,
  type Architecture,
} from "@archbook/schema";
import { buildElements } from "../src/graph/elements";
import { emphasisOf, flowHighlight, selectionHighlight } from "../src/graph/highlight";
import {
  GROUP_PADDING,
  NODE_HEIGHT,
  NODE_WIDTH,
  applyManualPositions,
  createLayoutEngine,
  drawableEdges,
  groupNodeId,
  layoutArchitecture,
  toElkGraph,
  visibleGroups,
  type Layout,
  type WorkerConstructor,
} from "../src/graph/layout";
import { flowUsages } from "../src/graph/usage";
import { edgeLabelName, elementLabels } from "../src/components/canvas/labels";
import { example } from "./example";

const checkout = example.flows.find((flow) => flow.id === "checkout")!;
const exampleIndex = indexArchitecture(example);

describe("layout", () => {
  // The example has no nested groups, so these tests add one, listed before its parent.
  const nested: Architecture = {
    ...example,
    groups: [{ id: "workers", name: "Workers", parent: "aws" }, ...example.groups],
    nodes: example.nodes.map((node) =>
      node.id === "payment-worker" ? { ...node, group: "workers" } : node,
    ),
  };

  it("orders groups parents first and hides empty groups", () => {
    const arch: Architecture = {
      ...nested,
      groups: [...nested.groups, { id: "empty", name: "Empty" }],
    };
    const ids = visibleGroups(arch).map((group) => group.id);
    expect(ids).not.toContain("empty");
    expect(ids.indexOf("aws")).toBeLessThan(ids.indexOf("workers"));
  });

  it("nests groups in the ELK graph in document order", () => {
    const graph = toElkGraph(nested);
    expect(graph.children!.map((child) => child.id)).toEqual([
      "customer",
      groupNodeId("vercel"),
      groupNodeId("aws"),
      "stripe",
      "postmark",
    ]);
    const aws = graph.children!.find((child) => child.id === groupNodeId("aws"))!;
    expect(aws.children!.map((child) => child.id)).toEqual([
      "orders-api",
      "outbox-relay",
      groupNodeId("workers"),
      "notifications-worker",
      "payments-queue",
      "order-events",
      "postgres",
      "redis",
    ]);
    expect(graph.edges).toHaveLength(example.edges.length);
  });

  it("lays out every node inside its group", async () => {
    const { boxes: layout } = await layoutArchitecture(example);
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

describe("layout engine", () => {
  const graph = () => toElkGraph(example);
  const laidOut = (result: { children?: Array<{ x?: number }> }) =>
    result.children?.some((child) => (child.x ?? 0) > 0) ?? false;

  type Reply = { data?: unknown; error?: unknown } | "load-error";

  /** Answers like elk-worker: `{ id, data }` or `{ id, error }` per message. */
  function fakeWorker(reply: (message: { id: number; cmd: string }) => Reply) {
    const created: string[] = [];
    class FakeWorker extends EventTarget {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      constructor(url: string) {
        super();
        created.push(url);
      }
      postMessage(message: { id: number; cmd: string }) {
        setTimeout(() => {
          const answer = reply(message);
          if (answer === "load-error") this.dispatchEvent(new Event("error"));
          else this.onmessage?.({ data: { id: message.id, ...answer } });
        });
      }
      terminate() {}
    }
    return { Worker: FakeWorker as unknown as WorkerConstructor, created };
  }

  it("lays out on the calling thread without Worker", async () => {
    expect(laidOut(await createLayoutEngine(undefined).layout(graph()))).toBe(true);
  });

  it("uses the worker when there is one", async () => {
    const marker = { id: "root", children: [{ id: "from-worker", x: 1 }] };
    const fake = fakeWorker((message) => (message.cmd === "layout" ? { data: marker } : {}));
    expect(await createLayoutEngine(fake.Worker).layout(graph())).toEqual(marker);
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]).toContain("elk-worker");
  });

  it("falls back when the worker cannot be created", async () => {
    const Throwing = class {
      constructor() {
        throw new Error("blocked");
      }
    } as unknown as WorkerConstructor;
    expect(laidOut(await createLayoutEngine(Throwing).layout(graph()))).toBe(true);
  });

  it("falls back when the worker fails to load, and keeps using the fallback", async () => {
    const fake = fakeWorker(() => "load-error");
    const engine = createLayoutEngine(fake.Worker);
    expect(laidOut(await engine.layout(graph()))).toBe(true);
    expect(laidOut(await engine.layout(graph()))).toBe(true);
    expect(fake.created).toHaveLength(1);
  });

  it("reports a graph the worker rejects instead of laying it out again", async () => {
    const fake = fakeWorker((message) =>
      message.cmd === "layout" ? { error: new Error("bad graph") } : {},
    );
    await expect(createLayoutEngine(fake.Worker).layout(graph())).rejects.toThrow("bad graph");
  });
});

describe("drawableEdges", () => {
  it("skips self-loops and edges with a missing endpoint", () => {
    const [first] = example.edges;
    const arch: Architecture = {
      ...example,
      edges: [
        first!,
        { ...first!, id: "loop", to: first!.from },
        { ...first!, id: "dangling", to: "missing" },
      ],
    };
    expect(drawableEdges(arch).map((edge) => edge.id)).toEqual([first!.id]);
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
    expect(nodes.find((node) => node.id === "orders-api")!.parentId).toBe(groupNodeId("aws"));
    expect(nodes.find((node) => node.id === "customer")!.parentId).toBeUndefined();
    expect(edges.map((edge) => edge.id)).toEqual(example.edges.map((edge) => edge.id));
  });

  it("names nodes and unlabelled edges, and leaves labelled edges to their label button", async () => {
    const [first, ...rest] = example.edges;
    const arch: Architecture = { ...example, edges: [{ ...first!, label: undefined }, ...rest] };
    const { nodes, edges } = buildElements(
      arch,
      await layoutArchitecture(arch),
      elementLabels(arch.nodes),
    );

    const node = nodes.find((item) => item.id === "orders-api")!;
    expect(node.ariaLabel).toBe(
      `${arch.nodes.find((item) => item.id === "orders-api")!.name}, Service`,
    );
    expect(nodes.find((item) => item.type === "group")!.focusable).toBe(false);

    const unlabelled = edges[0]!;
    expect(unlabelled.focusable).toBeUndefined();
    expect(unlabelled.ariaLabel).toMatch(/^HTTP from .+ to .+$/);

    const labelled = edges[1]!;
    expect(labelled.focusable).toBe(false);
    expect(labelled.domAttributes).toEqual({ "aria-hidden": true });
    expect(labelled.ariaLabel).toBeUndefined();
  });

  it("names labelled edges by kind and label", () => {
    const edge = example.edges.find((item) => item.kind === "http" && item.label)!;
    expect(elementLabels(example.nodes).edge(edge)).toBe(`HTTP: ${edge.label}`);
    expect(edgeLabelName(edge, edge.label!)).toBe(`HTTP: ${edge.label}`);
  });
});

describe("highlight", () => {
  it("follows reverse steps from the edge target", () => {
    const reverseIndex = checkout.steps.findIndex((step) => step.reverse);
    expect(stepEndpoints(exampleIndex, checkout, reverseIndex)).toEqual({
      from: "orders-api",
      to: "web-app",
    });
  });

  it("marks the current step active, earlier steps visited and the rest dimmed", () => {
    const highlight = flowHighlight(exampleIndex, checkout, 1, 800);
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
    const highlight = selectionHighlight(exampleIndex, "redis");
    expect(emphasisOf(highlight, "redis", "node")).toBe("active");
    expect(emphasisOf(highlight, "orders-api", "node")).toBe("visited");
    expect(emphasisOf(highlight, "stripe", "node")).toBe("dimmed");
    expect(selectionHighlight(exampleIndex, "nope").focused).toBe(false);
  });
});

describe("flowUsages", () => {
  it("lists flows in document order with ascending 1-based steps", () => {
    const edges = [...checkout.steps].reverse().map((step) => step.edge);
    const [usage, ...others] = flowUsages(exampleIndex, edges);
    expect(usage!.flow).toBe(checkout);
    expect(usage!.steps).toEqual(checkout.steps.map((_, i) => i + 1));
    const order = example.flows.map((flow) => flow.id);
    const ids = [usage!, ...others].map((u) => u.flow.id);
    expect(ids).toEqual(order.filter((id) => ids.includes(id)));
  });

  it("returns nothing for edges no flow uses", () => {
    expect(flowUsages(exampleIndex, ["nope"])).toEqual([]);
  });
});
