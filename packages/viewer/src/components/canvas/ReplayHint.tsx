import { Play } from "lucide-react";
import type { ArchFlow } from "@archbook/schema";
import styles from "./ReplayHint.module.css";

interface ReplayHintProps {
  flows: ArchFlow[];
  onOpenFlow: (flowId: string) => void;
}

/** Puts the viewer's main action, replaying a flow, on the canvas itself. */
export function ReplayHint({ flows, onOpenFlow }: ReplayHintProps) {
  const [first, ...rest] = flows;
  if (!first) return null;
  return (
    <div className={styles.hint}>
      <button type="button" className={styles.primary} onClick={() => onOpenFlow(first.id)}>
        <span className={styles.playIcon} aria-hidden>
          <Play size={13} fill="currentColor" />
        </span>
        <span className={styles.label}>
          <span className={styles.eyebrow}>Replay flow</span>
          <span className={styles.name}>{first.name}</span>
        </span>
        <span className={styles.steps}>{first.steps.length} steps</span>
      </button>
      {rest.length > 0 && <span className={styles.more}>+{rest.length} more in the panel</span>}
    </div>
  );
}
