import { createContext, useContext } from "react";
import type { ArchFlow, Architecture } from "@archbook/schema";

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

export const HighlightContext = createContext<Highlight>(NO_HIGHLIGHT);
export const useHighlight = () => useContext(HighlightContext);

export function emphasisOf(highlight: Highlight, id: string, kind: "node" | "edge"): Emphasis {
  const active = kind === "node" ? highlight.activeNodes : highlight.activeEdges;
  const visited = kind === "node" ? highlight.visitedNodes : highlight.visitedEdges;
  if (active.has(id)) return "active";
  if (visited.has(id)) return "visited";
  return highlight.focused ? "dimmed" : "normal";
}

/** Endpoints of a step in travel order, honoring `reverse`. */
export function stepEndpoints(
  arch: Architecture,
  flow: ArchFlow,
  index: number,
): { from: string; to: string } | undefined {
  const step = flow.steps[index];
  const edge = step && arch.edges.find((candidate) => candidate.id === step.edge);
  if (!step || !edge) return undefined;
  return step.reverse ? { from: edge.to, to: edge.from } : { from: edge.from, to: edge.to };
}

/** Highlight for a flow replay: the current step is active, earlier steps are visited. */
export function flowHighlight(
  arch: Architecture,
  flow: ArchFlow,
  index: number,
  travelMs: number,
): Highlight {
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  for (let i = 0; i < index; i++) {
    const ends = stepEndpoints(arch, flow, i);
    if (!ends) continue;
    visitedNodes.add(ends.from).add(ends.to);
    visitedEdges.add(flow.steps[i]!.edge);
  }
  const step = flow.steps[index];
  const ends = stepEndpoints(arch, flow, index);
  return {
    focused: true,
    activeNodes: ends ? new Set([ends.from, ends.to]) : EMPTY,
    activeEdges: step ? new Set([step.edge]) : EMPTY,
    visitedNodes,
    visitedEdges,
    travel:
      step && ends
        ? { edgeId: step.edge, reverse: step.reverse, travelMs, key: `${flow.id}:${index}` }
        : undefined,
  };
}

/** Highlight for a selected node (with its neighbors) or edge (with its endpoints). */
export function selectionHighlight(arch: Architecture, selectedId: string): Highlight {
  const edge = arch.edges.find((candidate) => candidate.id === selectedId);
  if (edge) {
    return {
      ...NO_HIGHLIGHT,
      focused: true,
      selectedId,
      activeEdges: new Set([edge.id]),
      activeNodes: new Set([edge.from, edge.to]),
    };
  }
  if (!arch.nodes.some((node) => node.id === selectedId)) return NO_HIGHLIGHT;
  const connected = arch.edges.filter((e) => e.from === selectedId || e.to === selectedId);
  return {
    ...NO_HIGHLIGHT,
    focused: true,
    selectedId,
    activeNodes: new Set([selectedId]),
    visitedNodes: new Set(connected.flatMap((e) => [e.from, e.to])),
    visitedEdges: new Set(connected.map((e) => e.id)),
  };
}
