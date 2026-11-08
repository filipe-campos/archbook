import {
  indexArchitecture,
  type ArchEdge,
  type Architecture,
  type ArchGroup,
} from "@archbook/schema";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api.js";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 88;
export const GROUP_PADDING = { top: 44, right: 28, bottom: 28, left: 28 };

export const groupNodeId = (groupId: string) => `group:${groupId}`;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Boxes keyed by canvas node id (group ids are prefixed). Positions are relative to the parent group. */
export type Layout = Map<string, Box>;

const ROOT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.spacing.nodeNode": "44",
  "elk.spacing.componentComponent": "90",
  "elk.spacing.edgeLabel": "8",
  // Respect document order: the first node listed (usually the actor) starts on the left.
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
};

const GROUP_OPTIONS: Record<string, string> = {
  "elk.padding": `[top=${GROUP_PADDING.top},left=${GROUP_PADDING.left},bottom=${GROUP_PADDING.bottom},right=${GROUP_PADDING.right}]`,
};

/** Groups ordered parents first, skipping groups that contain no nodes at any depth. */
export function visibleGroups(arch: Architecture): ArchGroup[] {
  const { groups: byId, groupsWithNodes } = indexArchitecture(arch);
  const depth = (group: ArchGroup): number => {
    let d = 0;
    const seen = new Set<string>();
    for (
      let parent = group.parent;
      parent && byId.has(parent) && !seen.has(parent);
      parent = byId.get(parent)?.parent
    ) {
      seen.add(parent);
      d++;
    }
    return d;
  };
  return arch.groups
    .filter((group) => groupsWithNodes.has(group.id))
    .sort((a, b) => depth(a) - depth(b));
}

/** Edges the canvas can draw: both endpoints exist and they differ. */
export function drawableEdges(arch: Architecture): ArchEdge[] {
  const nodeIds = new Set(arch.nodes.map((node) => node.id));
  return arch.edges.filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to,
  );
}

export function toElkGraph(arch: Architecture): ElkNode {
  const groups = new Map(visibleGroups(arch).map((group) => [group.id, group]));
  const elkGroups = new Map<string, ElkNode>();
  const root: ElkNode = { id: "root", layoutOptions: ROOT_OPTIONS, children: [], edges: [] };

  // Children are added in document order (a group appears where its first node does), because
  // the layout uses model order to break cycles and order nodes.
  const containerOf = (groupId: string | undefined): ElkNode => {
    const group = groupId ? groups.get(groupId) : undefined;
    if (!group) return root;
    let elkGroup = elkGroups.get(group.id);
    if (!elkGroup) {
      elkGroup = { id: groupNodeId(group.id), layoutOptions: GROUP_OPTIONS, children: [] };
      elkGroups.set(group.id, elkGroup);
      containerOf(group.parent).children!.push(elkGroup);
    }
    return elkGroup;
  };

  for (const node of arch.nodes) {
    containerOf(node.group).children!.push({ id: node.id, width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  root.edges = drawableEdges(arch).map((edge): ElkExtendedEdge => ({
    id: edge.id,
    sources: [edge.from],
    targets: [edge.to],
    // Reserve room for the label between layers; the canvas draws it itself.
    labels: edge.label
      ? [
          {
            id: `${edge.id}:label`,
            text: edge.label,
            width: edge.label.length * 7 + 20,
            height: 22,
          },
        ]
      : [],
  }));
  return root;
}

export interface LayoutEngine {
  layout(graph: ElkNode): Promise<ElkNode>;
}

export type WorkerConstructor = new (url: string) => Worker;

/** Marks a worker that could not start, as opposed to a graph ELK rejected. */
class WorkerUnavailable extends Error {}

async function inlineEngine(): Promise<LayoutEngine> {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  return new ELK();
}

async function workerEngine(WorkerImpl: WorkerConstructor): Promise<LayoutEngine> {
  const [{ default: ELK }, { default: workerUrl }] = await Promise.all([
    import("elkjs/lib/elk-api.js"),
    import("elkjs/lib/elk-worker.min.js?url"),
  ]);
  let failed: Promise<never> = new Promise(() => {});
  const elk = new ELK({
    workerUrl,
    workerFactory: (url) => {
      const worker = new WorkerImpl(url!);
      // elkjs never settles a layout when its worker fails to load (a 404, a CSP), so race it.
      failed = new Promise<never>((_, reject) => {
        worker.addEventListener(
          "error",
          (event) => reject(new WorkerUnavailable((event as ErrorEvent).message || "error")),
          { once: true },
        );
      });
      failed.catch(() => {});
      return worker;
    },
  });
  return { layout: (graph) => Promise.race([elk.layout(graph), failed]) };
}

/**
 * Runs ELK in a Web Worker so large graphs do not freeze the page, and on the calling thread
 * when `Worker` is missing (tests, restricted environments) or the worker fails to start.
 */
export function createLayoutEngine(
  WorkerImpl: WorkerConstructor | undefined = globalThis.Worker,
): LayoutEngine {
  let worker: Promise<LayoutEngine | undefined> = WorkerImpl
    ? workerEngine(WorkerImpl).catch(() => undefined)
    : Promise.resolve(undefined);
  let inline: Promise<LayoutEngine> | undefined;
  return {
    async layout(graph) {
      const engine = await worker;
      if (engine) {
        try {
          return await engine.layout(graph);
        } catch (error) {
          if (!(error instanceof WorkerUnavailable)) throw error;
          worker = Promise.resolve(undefined);
        }
      }
      inline ??= inlineEngine();
      return (await inline).layout(graph);
    },
  };
}

let defaultEngine: LayoutEngine | undefined;

export async function layoutArchitecture(
  arch: Architecture,
  engine: LayoutEngine = (defaultEngine ??= createLayoutEngine()),
): Promise<Layout> {
  const result = await engine.layout(toElkGraph(arch));
  const layout: Layout = new Map();
  const collect = (node: ElkNode) => {
    for (const child of node.children ?? []) {
      layout.set(child.id, {
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? NODE_WIDTH,
        height: child.height ?? NODE_HEIGHT,
      });
      collect(child);
    }
  };
  collect(result);
  applyManualPositions(arch, layout);
  return layout;
}

/** Applies `position` overrides, then grows groups so they still enclose their children. */
export function applyManualPositions(arch: Architecture, layout: Layout): void {
  for (const node of arch.nodes) {
    const box = layout.get(node.id);
    if (box && node.position) Object.assign(box, node.position);
  }

  const groups = visibleGroups(arch).reverse();
  for (const group of groups) {
    const box = layout.get(groupNodeId(group.id));
    if (!box) continue;
    const children = [
      ...arch.nodes.filter((node) => node.group === group.id).map((node) => node.id),
      ...groups.filter((g) => g.parent === group.id).map((g) => groupNodeId(g.id)),
    ]
      .map((id) => layout.get(id))
      .filter((child): child is Box => child !== undefined);
    for (const child of children) {
      box.width = Math.max(box.width, child.x + child.width + GROUP_PADDING.right);
      box.height = Math.max(box.height, child.y + child.height + GROUP_PADDING.bottom);
    }
  }
}
