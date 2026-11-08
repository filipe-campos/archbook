import type { ArchEdge, ArchGroup, ArchNode, Architecture } from "@archbook/schema";
import type { Edge, Node } from "@xyflow/react";
import { drawableEdges, groupNodeId, visibleGroups, type Layout } from "./layout";

export type ArchNodeData = { node: ArchNode };
export type GroupNodeData = { group: ArchGroup };
export type ArchEdgeData = { edge: ArchEdge };

export type ArchCanvasNode = Node<ArchNodeData, "arch">;
export type GroupCanvasNode = Node<GroupNodeData, "group">;
export type CanvasNode = ArchCanvasNode | GroupCanvasNode;
export type CanvasEdge = Edge<ArchEdgeData, "arch">;

/** Accessible names for canvas elements, read by screen readers. */
export interface ElementLabels {
  node: (node: ArchNode) => string;
  edge: (edge: ArchEdge) => string;
}

/** Converts the document and its layout into canvas elements. Parents come before children. */
export function buildElements(
  arch: Architecture,
  layout: Layout,
  labels?: ElementLabels,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const groups = visibleGroups(arch);
  const shownGroups = new Set(groups.map((group) => group.id));
  const nodes: CanvasNode[] = [];

  for (const group of groups) {
    const id = groupNodeId(group.id);
    const box = layout.get(id);
    if (!box) continue;
    nodes.push({
      id,
      type: "group",
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      data: { group },
      ...(group.parent && shownGroups.has(group.parent)
        ? { parentId: groupNodeId(group.parent) }
        : {}),
      draggable: false,
      selectable: false,
      focusable: false,
    });
  }

  for (const node of arch.nodes) {
    const box = layout.get(node.id);
    if (!box) continue;
    const grouped = node.group !== undefined && shownGroups.has(node.group);
    nodes.push({
      id: node.id,
      type: "arch",
      position: { x: box.x, y: box.y },
      data: { node },
      ...(labels ? { ariaLabel: labels.node(node) } : {}),
      ...(grouped ? { parentId: groupNodeId(node.group!), extent: "parent" as const } : {}),
    });
  }

  // A labelled edge is reached through its label button, so its path is not a second tab stop.
  const edges: CanvasEdge[] = drawableEdges(arch).map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: "arch",
    data: { edge },
    ...(edge.label
      ? { focusable: false, domAttributes: { "aria-hidden": true } }
      : labels
        ? { ariaLabel: labels.edge(edge) }
        : {}),
  }));

  return { nodes, edges };
}
