import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type AriaLabelConfig,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import type { Architecture } from "@archbook/schema";
import type { Theme } from "../../data/useTheme";
import {
  buildElements,
  type ArchNodeData,
  type CanvasEdge,
  type CanvasNode,
} from "../../graph/elements";
import type { Highlight } from "../../graph/highlight";
import { layoutArchitecture } from "../../graph/layout";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { ArchEdgeView, EdgeMarkers } from "./ArchEdgeView";
import { ArchNodeView, GroupNodeView } from "./ArchNodeView";
import { CanvasActionsContext, HighlightContext } from "./context";
import { elementLabels } from "./labels";
import { useCameraFocus, type CameraFocus, type CameraMove } from "./useCameraFocus";
import styles from "./Canvas.module.css";

const nodeTypes: NodeTypes = { arch: ArchNodeView, group: GroupNodeView };
const edgeTypes: EdgeTypes = { arch: ArchEdgeView };

export type { CameraFocus } from "./useCameraFocus";

const STEP_MOVE: CameraMove = { duration: 700, padding: 0.45, maxZoom: 1.25 };
const SEARCH_MOVE: CameraMove = { duration: 600, padding: 0.6, maxZoom: 1.2 };
const still = (move: CameraMove): CameraMove => ({ ...move, duration: 0 });
const STILL_STEP_MOVE = still(STEP_MOVE);
const STILL_SEARCH_MOVE = still(SEARCH_MOVE);

// React Flow's defaults describe selecting, moving and deleting, which the viewer does not offer.
const ARIA_LABELS: Partial<AriaLabelConfig> = {
  "node.a11yDescription.default": "Press Enter or Space to show its details.",
  "node.a11yDescription.keyboardDisabled": "Press Enter or Space to show its details.",
  "edge.a11yDescription.default": "Press Enter or Space to show its details.",
};

/** Enter or Space on a focused component or edge opens it, like a click. */
const activatedId = (event: KeyboardEvent): string | undefined => {
  if (event.key !== "Enter" && event.key !== " ") return undefined;
  const target = event.target;
  if (!(target instanceof Element)) return undefined;
  if (!target.matches(".react-flow__node-arch, .react-flow__edge")) return undefined;
  return target.getAttribute("data-id") ?? undefined;
};

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
  const [layoutError, setLayoutError] = useState<string>();
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const fitted = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let cancelled = false;
    layoutArchitecture(architecture)
      .then((layout) => {
        if (cancelled) return;
        const elements = buildElements(architecture, layout, elementLabels(architecture.nodes));
        setNodes(elements.nodes);
        setEdges(elements.edges);
        setLaidOut(true);
        setLayoutError(undefined);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLayoutError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [architecture, setNodes]);

  // Fit everything once; later reloads keep the camera where the user left it.
  useEffect(() => {
    if (!initialized || fitted.current) return;
    fitted.current = true;
    if (!stepFocus) void fitView({ padding: 0.12, duration: reducedMotion ? 0 : 300 });
  }, [initialized, fitView, stepFocus, reducedMotion]);

  useCameraFocus(stepFocus, reducedMotion ? STILL_STEP_MOVE : STEP_MOVE);
  useCameraFocus(searchFocus, reducedMotion ? STILL_SEARCH_MOVE : SEARCH_MOVE);

  const actions = useMemo(() => ({ select: onSelect }), [onSelect]);
  // Without `travel` no particle is drawn; the active edge keeps its emphasis.
  const shownHighlight = useMemo(
    () => (reducedMotion && highlight.travel ? { ...highlight, travel: undefined } : highlight),
    [reducedMotion, highlight],
  );

  return (
    <div className={styles.canvas}>
      <CanvasActionsContext.Provider value={actions}>
        <HighlightContext.Provider value={shownHighlight}>
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
            onKeyDown={(event) => {
              const id = activatedId(event);
              if (!id) return;
              event.preventDefault();
              onSelect(id);
            }}
            ariaLabelConfig={ARIA_LABELS}
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
      {layoutError ? (
        <div className={styles.loading} role="alert">
          Could not lay out the architecture: {layoutError}
        </div>
      ) : (
        !laidOut && <div className={styles.loading}>Laying out the architecture…</div>
      )}
    </div>
  );
}
