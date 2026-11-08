import { memo, type CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cx } from "../../lib/cx";
import type { ArchCanvasNode, GroupCanvasNode } from "../../graph/elements";
import { emphasisOf, useHighlight } from "../../graph/highlight";
import { NODE_KIND_STYLES } from "../../graph/kinds";
import styles from "./Canvas.module.css";

const MAX_TECH_CHIPS = 3;

export const ArchNodeView = memo(function ArchNodeView({ id, data }: NodeProps<ArchCanvasNode>) {
  const highlight = useHighlight();
  const emphasis = emphasisOf(highlight, id, "node");
  const kind = NODE_KIND_STYLES[data.node.kind];
  const Icon = kind.icon;
  const tech = data.node.tech;
  const hidden = tech.length - MAX_TECH_CHIPS;

  return (
    <div
      className={cx(
        styles.node,
        emphasis !== "normal" && styles[emphasis],
        highlight.selectedId === id && styles.selected,
      )}
      style={{ "--kind": kind.color } as CSSProperties}
      title={data.node.summary}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={styles.handle}
        isConnectable={false}
      />
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden>
          <Icon size={18} strokeWidth={2.2} />
        </span>
        <div className={styles.titles}>
          <div className={styles.name}>{data.node.name}</div>
          <div className={styles.kindLabel}>{kind.label}</div>
        </div>
      </div>
      {tech.length > 0 && (
        <div className={styles.tech}>
          {tech.slice(0, MAX_TECH_CHIPS).map((item) => (
            <span key={item} className={styles.chip}>
              {item}
            </span>
          ))}
          {hidden > 0 && <span className={styles.chip}>+{hidden}</span>}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className={styles.handle}
        isConnectable={false}
      />
    </div>
  );
});

export const GroupNodeView = memo(function GroupNodeView({ data }: NodeProps<GroupCanvasNode>) {
  const highlight = useHighlight();
  return (
    <div
      className={cx(styles.group, highlight.focused && styles.groupDimmed)}
      title={data.group.description}
    >
      <div className={styles.groupLabel}>{data.group.name}</div>
    </div>
  );
});
