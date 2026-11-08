import type { ArchEdge, ArchNode } from "@archbook/schema";
import type { ElementLabels } from "../../graph/elements";
import { EDGE_KIND_STYLES, NODE_KIND_STYLES } from "../kinds";

/** "HTTP: POST /orders" */
export const edgeLabelName = (edge: ArchEdge, label: string) =>
  `${EDGE_KIND_STYLES[edge.kind].label}: ${label}`;

export function elementLabels(nodes: readonly ArchNode[]): ElementLabels {
  const names = new Map(nodes.map((node) => [node.id, node.name]));
  const name = (id: string) => names.get(id) ?? id;
  return {
    node: (node) => `${node.name}, ${NODE_KIND_STYLES[node.kind].label}`,
    edge: (edge) =>
      edge.label
        ? edgeLabelName(edge, edge.label)
        : `${EDGE_KIND_STYLES[edge.kind].label} from ${name(edge.from)} to ${name(edge.to)}`,
  };
}
