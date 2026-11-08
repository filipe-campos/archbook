import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { ArchFlow, Architecture, ArchitectureIndex, ValidationIssue } from "@archbook/schema";
import { EdgePanel, NodePanel, OverviewPanel, StepPanel, type PanelActions } from "./Panels";
import styles from "./Panel.module.css";

interface DetailsPanelProps {
  architecture: Architecture;
  index: ArchitectureIndex;
  warnings: ValidationIssue[];
  flow: ArchFlow | undefined;
  stepIndex: number;
  /** Node or edge to show instead of the step or the overview. */
  target: string | undefined;
  actions: PanelActions;
  /** Leaves `target`: back to the step during a replay, otherwise to the overview. */
  onBack: () => void;
}

export function DetailsPanel(props: DetailsPanelProps) {
  const { architecture, index, warnings, flow, stepIndex, target, actions, onBack } = props;
  let panel: ReactNode;

  if (target) {
    const node = index.nodes.get(target);
    const edge = index.edges.get(target);
    panel = node ? (
      <NodePanel architecture={architecture} index={index} node={node} actions={actions} />
    ) : edge ? (
      <EdgePanel architecture={architecture} index={index} edge={edge} actions={actions} />
    ) : null;
  } else if (flow?.steps[stepIndex]) {
    panel = <StepPanel index={index} flow={flow} stepIndex={stepIndex} actions={actions} />;
  } else {
    panel = <OverviewPanel architecture={architecture} warnings={warnings} actions={actions} />;
  }

  const stepKey = flow ? `${flow.id}:${stepIndex}` : undefined;
  return (
    <aside className={styles.panel} aria-label="Details">
      <div className={styles.body} key={target ?? stepKey ?? "overview"}>
        {target && (
          <button type="button" className={styles.back} onClick={onBack}>
            <ArrowLeft size={15} />
            {flow ? `Back to step ${stepIndex + 1}` : "Overview"}
          </button>
        )}
        {panel}
      </div>
    </aside>
  );
}
