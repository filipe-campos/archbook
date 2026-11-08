import type { ArchEdge, ArchGroup, ArchNode, Architecture } from "@archbook/schema";
import type { Edge, Node } from "@xyflow/react";
import { groupNodeId, visibleGroups, type Layout } from "./layout";

export type ArchNodeData = { node: ArchNode };
export type GroupNodeData = { group: ArchGroup };
export type ArchEdgeData = { edge: ArchEdge };

export type ArchCanvasNode = Node<ArchNodeData, "arch">;
export type GroupCanvasNode = Node<GroupNodeData, "group">;
export type CanvasNode = ArchCanvasNode | GroupCanvasNode;
export type CanvasEdge = Edge<ArchEdgeData, "arch">;

/** Converts the document and its layout into canvas elements. Parents come before children. */
export function buildElements(
  arch: Architecture,
  layout: Layout,
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
      ...(grouped ? { parentId: groupNodeId(node.group!), extent: "parent" as const } : {}),
    });
  }

  const nodeIds = new Set(arch.nodes.map((node) => node.id));
  const edges: CanvasEdge[] = arch.edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to)
    .map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: "arch",
      data: { edge },
    }));

  return { nodes, edges };
}
