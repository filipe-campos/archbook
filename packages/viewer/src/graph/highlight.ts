import { stepEndpoints, type ArchFlow, type ArchitectureIndex } from "@archbook/schema";

export type Emphasis = "active" | "visited" | "normal" | "dimmed";

export interface Travel {
  edgeId: string;
  reverse: boolean;
  travelMs: number;
  /** Changes on every step so the particle restarts even when a step reuses the same edge. */
  key: string;
}

export interface Highlight {
  /** When true, anything not active or visited is dimmed. */
  focused: boolean;
  activeNodes: ReadonlySet<string>;
  activeEdges: ReadonlySet<string>;
  visitedNodes: ReadonlySet<string>;
  visitedEdges: ReadonlySet<string>;
  selectedId?: string;
  travel?: Travel;
}

const EMPTY = new Set<string>();

export const NO_HIGHLIGHT: Highlight = {
  focused: false,
  activeNodes: EMPTY,
  activeEdges: EMPTY,
  visitedNodes: EMPTY,
  visitedEdges: EMPTY,
};

export function emphasisOf(highlight: Highlight, id: string, kind: "node" | "edge"): Emphasis {
  const active = kind === "node" ? highlight.activeNodes : highlight.activeEdges;
  const visited = kind === "node" ? highlight.visitedNodes : highlight.visitedEdges;
  if (active.has(id)) return "active";
  if (visited.has(id)) return "visited";
  return highlight.focused ? "dimmed" : "normal";
}

/** Highlight for a flow replay: the current step is active, earlier steps are visited. */
export function flowHighlight(
  index: ArchitectureIndex,
  flow: ArchFlow,
  stepIndex: number,
  travelMs: number,
): Highlight {
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  for (let i = 0; i < stepIndex; i++) {
    const ends = stepEndpoints(index, flow, i);
    if (!ends) continue;
    visitedNodes.add(ends.from).add(ends.to);
    visitedEdges.add(flow.steps[i]!.edge);
  }
  const step = flow.steps[stepIndex];
  const ends = stepEndpoints(index, flow, stepIndex);
  return {
    focused: true,
    activeNodes: ends ? new Set([ends.from, ends.to]) : EMPTY,
    activeEdges: step ? new Set([step.edge]) : EMPTY,
    visitedNodes,
    visitedEdges,
    travel:
      step && ends
        ? { edgeId: step.edge, reverse: step.reverse, travelMs, key: `${flow.id}:${stepIndex}` }
        : undefined,
  };
}

/** Highlight for a selected node (with its neighbors) or edge (with its endpoints). */
export function selectionHighlight(index: ArchitectureIndex, selectedId: string): Highlight {
  const edge = index.edges.get(selectedId);
  if (edge) {
    return {
      ...NO_HIGHLIGHT,
      focused: true,
      selectedId,
      activeEdges: new Set([edge.id]),
      activeNodes: new Set([edge.from, edge.to]),
    };
  }
  if (!index.nodes.has(selectedId)) return NO_HIGHLIGHT;
  const connected = [
    ...(index.outgoing.get(selectedId) ?? []),
    ...(index.incoming.get(selectedId) ?? []),
  ];
  return {
    ...NO_HIGHLIGHT,
    focused: true,
    selectedId,
    activeNodes: new Set([selectedId]),
    visitedNodes: new Set(connected.flatMap((e) => [e.from, e.to])),
    visitedEdges: new Set(connected.map((e) => e.id)),
  };
}
