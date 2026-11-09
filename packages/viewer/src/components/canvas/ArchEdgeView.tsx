import { memo, useEffect, useRef } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { cx } from "../../lib/cx";
import type { CanvasEdge } from "../../graph/elements";
import { emphasisOf, type Emphasis } from "../../graph/highlight";
import { EDGE_KIND_STYLES } from "../kinds";
import { useCanvasActions, useHighlight } from "./context";
import { edgeLabelName } from "./labels";
import styles from "./Canvas.module.css";

const EDGE_CLASS: Record<Emphasis, string | undefined> = {
  active: styles.edgeActive,
  visited: styles.edgeVisited,
  normal: undefined,
  dimmed: styles.edgeDimmed,
};

const MARKER_IDS: Record<Emphasis, string> = {
  active: "archbook-arrow-active",
  visited: "archbook-arrow-visited",
  normal: "archbook-arrow",
  dimmed: "archbook-arrow",
};

export const ArchEdgeView = memo(function ArchEdgeView(props: EdgeProps<CanvasEdge>) {
  const { id, data, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const highlight = useHighlight();
  const actions = useCanvasActions();
  const emphasis = emphasisOf(highlight, id, "edge");
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  if (!data) return null;
  const kind = EDGE_KIND_STYLES[data.edge.kind];
  const travel = highlight.travel?.edgeId === id ? highlight.travel : undefined;

  return (
    <>
      <g className={cx(styles.edge, EDGE_CLASS[emphasis])}>
        <BaseEdge
          id={id}
          path={path}
          className={styles.edgePath}
          style={{ strokeDasharray: kind.dash }}
          markerEnd={`url(#${MARKER_IDS[emphasis]})`}
          interactionWidth={18}
        />
      </g>
      {travel && (
        <path
          d={path}
          className={cx(styles.edgeCurrent, travel.reverse && styles.edgeCurrentReverse)}
          aria-hidden
        />
      )}
      {travel && (
        <Particle
          key={travel.key}
          path={path}
          reverse={travel.reverse}
          durationMs={travel.travelMs}
        />
      )}
      {data.edge.label && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={cx(
              styles.edgeLabel,
              "nodrag",
              "nopan",
              emphasis === "active" && styles.edgeLabelActive,
              emphasis === "dimmed" && styles.edgeLabelDimmed,
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title={edgeLabelName(data.edge, data.edge.label)}
            aria-label={edgeLabelName(data.edge, data.edge.label)}
            onClick={() => actions.select(id)}
          >
            {data.edge.label}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

function Particle({
  path,
  reverse,
  durationMs,
}: {
  path: string;
  reverse: boolean;
  durationMs: number;
}) {
  const motion = useRef<SVGAnimateMotionElement>(null);

  // SMIL animations added after page load start mid-cycle unless begun explicitly.
  useEffect(() => {
    motion.current?.beginElement();
  }, []);

  return (
    <g aria-hidden>
      <circle r={11} className={styles.particleGlow} />
      <circle r={4.5} className={styles.particleCore} />
      <animateMotion
        ref={motion}
        begin="indefinite"
        dur={`${Math.round(durationMs)}ms`}
        repeatCount="indefinite"
        path={path}
        keyPoints={reverse ? "1;0" : "0;1"}
        keyTimes="0;1"
        calcMode="linear"
      />
    </g>
  );
}

/** Arrowhead definitions shared by all edges; colors come from CSS so they follow the theme. */
export function EdgeMarkers() {
  const markers: Array<[string, string]> = [
    [MARKER_IDS.normal, styles.arrow!],
    [MARKER_IDS.visited, styles.arrowVisited!],
    [MARKER_IDS.active, styles.arrowActive!],
  ];
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        {markers.map(([id, className]) => (
          <marker
            key={id}
            id={id}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className={className} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
