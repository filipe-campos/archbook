import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import type { Architecture } from "@archbook/schema";
import type { Theme } from "../../data/useTheme";
import { CanvasActionsContext } from "../../graph/actions";
import {
  buildElements,
  type ArchNodeData,
  type CanvasEdge,
  type CanvasNode,
} from "../../graph/elements";
import { HighlightContext, type Highlight } from "../../graph/highlight";
import { layoutArchitecture } from "../../graph/layout";
import { ArchEdgeView, EdgeMarkers } from "./ArchEdgeView";
import { ArchNodeView, GroupNodeView } from "./ArchNodeView";
import styles from "./Canvas.module.css";

const nodeTypes: NodeTypes = { arch: ArchNodeView, group: GroupNodeView };
const edgeTypes: EdgeTypes = { arch: ArchEdgeView };

/** A request to move the camera; a new `key` triggers a new move. */
export interface CameraFocus {
  key: string;
  ids: string[];
}

interface CanvasProps {
  architecture: Architecture;
  highlight: Highlight;
  theme: Theme;
  stepFocus?: CameraFocus;
  searchFocus?: CameraFocus;
  onSelect: (id: string) => void;
  onClear: () => void;
}

const minimapClass = (node: Node) =>
  node.type === "group" ? "minimap-group" : `minimap-${(node.data as ArchNodeData).node.kind}`;

export function Canvas({
  architecture,
  highlight,
  theme,
  stepFocus,
  searchFocus,
  onSelect,
  onClear,
}: CanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [laidOut, setLaidOut] = useState(false);
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const fitted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void layoutArchitecture(architecture).then((layout) => {
      if (cancelled) return;
      const elements = buildElements(architecture, layout);
      setNodes(elements.nodes);
      setEdges(elements.edges);
      setLaidOut(true);
    });
    return () => {
      cancelled = true;
    };
  }, [architecture, setNodes]);

  // Fit everything once; later reloads keep the camera where the user left it.
  useEffect(() => {
    if (!initialized || fitted.current) return;
    fitted.current = true;
    if (!stepFocus) void fitView({ padding: 0.12, duration: 300 });
  }, [initialized, fitView, stepFocus]);

  // Callers keep focus objects referentially stable until the target changes.
  useEffect(() => {
    if (!initialized || !stepFocus) return;
    void fitView({
      nodes: stepFocus.ids.map((id) => ({ id })),
      duration: 700,
      padding: 0.45,
      maxZoom: 1.25,
    });
  }, [initialized, stepFocus, fitView]);

  useEffect(() => {
    if (!initialized || !searchFocus) return;
    void fitView({
      nodes: searchFocus.ids.map((id) => ({ id })),
      duration: 600,
      padding: 0.6,
      maxZoom: 1.2,
    });
  }, [initialized, searchFocus, fitView]);

  const actions = useMemo(() => ({ select: onSelect }), [onSelect]);

  return (
    <div className={styles.canvas}>
      <CanvasActionsContext.Provider value={actions}>
        <HighlightContext.Provider value={highlight}>
          <EdgeMarkers />
          <ReactFlow<CanvasNode, CanvasEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => node.type === "arch" && onSelect(node.id)}
            onEdgeClick={(_, edge) => onSelect(edge.id)}
            onPaneClick={onClear}
            colorMode={theme}
            nodesConnectable={false}
            elementsSelectable={false}
            minZoom={0.1}
            maxZoom={2.5}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} />
            <Controls showInteractive={false} position="top-left" />
            <MiniMap pannable zoomable nodeClassName={minimapClass} position="bottom-right" />
          </ReactFlow>
        </HighlightContext.Provider>
      </CanvasActionsContext.Provider>
      {!laidOut && <div className={styles.loading}>Laying out the architecture…</div>}
    </div>
  );
}
