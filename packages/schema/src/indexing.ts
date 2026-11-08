import type { ArchEdge, ArchFlow, ArchGroup, ArchNode, Architecture } from "./architecture.js";

export interface StepRef {
  flow: ArchFlow;
  stepIndex: number;
}

/** Lookups over a document. When ids repeat, the first item with the id wins. */
export interface ArchitectureIndex {
  nodes: ReadonlyMap<string, ArchNode>;
  edges: ReadonlyMap<string, ArchEdge>;
  groups: ReadonlyMap<string, ArchGroup>;
  flows: ReadonlyMap<string, ArchFlow>;
  /** Edges by `from` node, in document order. */
  outgoing: ReadonlyMap<string, readonly ArchEdge[]>;
  /** Edges by `to` node, in document order. */
  incoming: ReadonlyMap<string, readonly ArchEdge[]>;
  /** Flow steps that travel each edge, in document order. */
  stepsByEdge: ReadonlyMap<string, readonly StepRef[]>;
  /** Groups that hold a node directly or through nested groups. */
  groupsWithNodes: ReadonlySet<string>;
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) if (!map.has(item.id)) map.set(item.id, item);
  return map;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function indexArchitecture(doc: Architecture): ArchitectureIndex {
  const groups = byId(doc.groups);
  const outgoing = new Map<string, ArchEdge[]>();
  const incoming = new Map<string, ArchEdge[]>();
  for (const edge of doc.edges) {
    push(outgoing, edge.from, edge);
    push(incoming, edge.to, edge);
  }

  const stepsByEdge = new Map<string, StepRef[]>();
  for (const flow of doc.flows) {
    flow.steps.forEach((step, stepIndex) => push(stepsByEdge, step.edge, { flow, stepIndex }));
  }

  const groupsWithNodes = new Set<string>();
  for (const node of doc.nodes) {
    // Stops at unknown groups and at the first group already marked, which also ends parent cycles.
    for (
      let id = node.group;
      id !== undefined && groups.has(id) && !groupsWithNodes.has(id);
      id = groups.get(id)?.parent
    ) {
      groupsWithNodes.add(id);
    }
  }

  return {
    nodes: byId(doc.nodes),
    edges: byId(doc.edges),
    groups,
    flows: byId(doc.flows),
    outgoing,
    incoming,
    stepsByEdge,
    groupsWithNodes,
  };
}

/** Endpoints of a step in travel order, honoring `reverse`. */
export function stepEndpoints(
  index: ArchitectureIndex,
  flow: ArchFlow,
  stepIndex: number,
): { from: string; to: string } | undefined {
  const step = flow.steps[stepIndex];
  const edge = step && index.edges.get(step.edge);
  if (!step || !edge) return undefined;
  return step.reverse ? { from: edge.to, to: edge.from } : { from: edge.from, to: edge.to };
}
