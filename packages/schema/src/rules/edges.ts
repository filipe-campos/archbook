import { suggest } from "../text.js";
import type { ElementRule } from "./context.js";

export const edgeEnds: ElementRule<"edges"> = ({ doc, index, report }, edge, position) => {
  for (const end of ["from", "to"] as const) {
    if (index.nodes.has(edge[end])) continue;
    const nodeIds = doc.nodes.map((node) => node.id);
    report(
      "unknown-node",
      ["edges", position, end],
      `Edge "${edge.id}" ${end} unknown node "${edge[end]}".${suggest(edge[end], nodeIds)}`,
    );
  }
};

export const selfLoopEdge: ElementRule<"edges"> = ({ report }, edge, position) => {
  if (edge.from !== edge.to) return;
  report(
    "self-loop-edge",
    ["edges", position],
    `Edge "${edge.id}" goes from "${edge.from}" to itself, so the viewer does not draw it. Describe the internal work in the node instead, or point the edge at the component it really reaches.`,
  );
};

export const duplicateEdge: ElementRule<"edges"> = ({ index, report }, edge, position) => {
  // An entry whose id repeats an earlier one is already a duplicate-id error.
  if (index.edges.get(edge.id) !== edge) return;
  const first = index.outgoing
    .get(edge.from)
    ?.find((candidate) => candidate.to === edge.to && candidate.kind === edge.kind);
  if (!first || first === edge) return;
  report(
    "duplicate-edge",
    ["edges", position],
    `Edge "${edge.id}" repeats edge "${first.id}" (${edge.kind} from "${edge.from}" to "${edge.to}"). Merge them into "${first.id}", combining labels and sources, and point flow steps at it.`,
  );
};
