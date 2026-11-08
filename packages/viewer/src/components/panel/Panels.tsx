import type { CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Clock, Play, Undo2, Zap } from "lucide-react";
import {
  formatIssuePath,
  stepEndpoints,
  type ArchEdge,
  type ArchFlow,
  type ArchNode,
  type Architecture,
  type ArchitectureIndex,
  type NodeKind,
  type ValidationIssue,
} from "@archbook/schema";
import { flowUsages, type FlowUsage } from "../../graph/usage";
import { EDGE_KIND_STYLES, NODE_KIND_STYLES } from "../kinds";
import { formatDuration } from "../../lib/playback";
import { JsonView } from "./JsonView";
import { Markdown } from "./Markdown";
import { Links, NodeRef, Section, SourceList, kindStyle } from "./parts";
import styles from "./Panel.module.css";

export interface PanelActions {
  select: (id: string) => void;
  openFlow: (flowId: string, step?: number) => void;
}

function FlowUsageList({ usages, actions }: { usages: FlowUsage[]; actions: PanelActions }) {
  if (usages.length === 0) return null;
  return (
    <Section title="Appears in flows">
      <ul className={styles.list}>
        {usages.map(({ flow, steps }) => (
          <li key={flow.id}>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => actions.openFlow(flow.id, steps[0])}
            >
              <Play size={14} />
              {flow.name}
              <span className={styles.muted}>
                {steps.length === 1 ? `step ${steps[0]}` : `steps ${steps.join(", ")}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function OverviewPanel({
  architecture,
  warnings,
  actions,
}: {
  architecture: Architecture;
  warnings: ValidationIssue[];
  actions: PanelActions;
}) {
  const kinds = [...new Set(architecture.nodes.map((node) => node.kind))] as NodeKind[];
  return (
    <>
      <div className={styles.eyebrow}>Architecture</div>
      <h2 className={styles.title}>{architecture.project.name}</h2>
      {architecture.project.description && (
        <p className={styles.summary}>{architecture.project.description}</p>
      )}
      <div className={styles.stats}>
        <Stat value={architecture.nodes.length} label="components" />
        <Stat value={architecture.edges.length} label="connections" />
        <Stat value={architecture.flows.length} label="flows" />
      </div>

      <Section title="Flows">
        {architecture.flows.length === 0 ? (
          <p className={styles.empty}>No flows documented yet.</p>
        ) : (
          <ul className={styles.list}>
            {architecture.flows.map((flow) => (
              <li key={flow.id}>
                <button
                  type="button"
                  className={styles.flowCard}
                  onClick={() => actions.openFlow(flow.id)}
                >
                  <div className={styles.flowCardTitle}>
                    <Play size={15} />
                    {flow.name}
                    <span className={styles.badge} style={{ marginLeft: "auto" }}>
                      {flow.steps.length} steps
                    </span>
                  </div>
                  <div className={styles.flowCardSummary}>{flow.summary}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Legend">
        <div className={styles.legend}>
          {kinds.map((kind) => {
            const style = NODE_KIND_STYLES[kind];
            const Icon = style.icon;
            return (
              <span
                key={kind}
                className={styles.legendItem}
                style={{ "--kind": style.color } as CSSProperties}
              >
                <Icon size={15} strokeWidth={2.2} />
                {style.label}
              </span>
            );
          })}
        </div>
      </Section>

      {warnings.length > 0 && (
        <Section title={`Warnings (${warnings.length})`}>
          <ul className={styles.list}>
            {warnings.map((warning, index) => (
              <li key={index} className={styles.issue}>
                <code className={styles.issuePath}>{formatIssuePath(warning.path)}</code>
                {warning.message}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {architecture.generatedAt && (
        <p className={styles.empty} style={{ marginTop: 24, fontSize: 12.5 }}>
          Generated {new Date(architecture.generatedAt).toLocaleString()}
          {architecture.generatedBy ? ` by ${architecture.generatedBy}` : ""}
        </p>
      )}
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

export function NodePanel({
  architecture,
  index,
  node,
  actions,
}: {
  architecture: Architecture;
  index: ArchitectureIndex;
  node: ArchNode;
  actions: PanelActions;
}) {
  const kind = NODE_KIND_STYLES[node.kind];
  const Icon = kind.icon;
  const outgoing = index.outgoing.get(node.id) ?? [];
  const incoming = index.incoming.get(node.id) ?? [];
  const group = node.group === undefined ? undefined : index.groups.get(node.group);
  const usages = flowUsages(
    index,
    [...outgoing, ...incoming].map((e) => e.id),
  );

  return (
    <>
      <div className={styles.titleRow} style={kindStyle(node)}>
        <span className={styles.kindIcon}>
          <Icon size={22} strokeWidth={2.2} />
        </span>
        <div>
          <div className={styles.eyebrow} style={{ marginBottom: 0 }}>
            {kind.label}
            {group && ` · ${group.name}`}
          </div>
          <h2 className={styles.title}>{node.name}</h2>
        </div>
      </div>
      <p className={styles.summary}>{node.summary}</p>

      {node.tech.length > 0 && (
        <div className={styles.chips}>
          {node.tech.map((tech) => (
            <span key={tech} className={styles.chip}>
              {tech}
            </span>
          ))}
        </div>
      )}

      {node.description && (
        <Section title="Details">
          <Markdown>{node.description}</Markdown>
        </Section>
      )}

      {node.owner && (
        <Section title="Owner">
          <span>{node.owner}</span>
        </Section>
      )}

      <SourceList sources={node.sources} project={architecture.project} />

      {(outgoing.length > 0 || incoming.length > 0) && (
        <Section title="Connections">
          <ul className={styles.list}>
            {outgoing.map((edge) => (
              <ConnectionItem
                key={edge.id}
                edge={edge}
                other={index.nodes.get(edge.to)}
                direction="out"
                actions={actions}
              />
            ))}
            {incoming.map((edge) => (
              <ConnectionItem
                key={edge.id}
                edge={edge}
                other={index.nodes.get(edge.from)}
                direction="in"
                actions={actions}
              />
            ))}
          </ul>
        </Section>
      )}

      <FlowUsageList usages={usages} actions={actions} />
      <Links links={node.links} />
    </>
  );
}

function ConnectionItem({
  edge,
  other,
  direction,
  actions,
}: {
  edge: ArchEdge;
  other: ArchNode | undefined;
  direction: "in" | "out";
  actions: PanelActions;
}) {
  const Arrow = direction === "out" ? ArrowRight : ArrowLeft;
  return (
    <li>
      <button type="button" className={styles.linkButton} onClick={() => actions.select(edge.id)}>
        <Arrow size={14} className={styles.arrowIcon} />
        {other?.name ?? (direction === "out" ? edge.to : edge.from)}
        <span className={styles.muted}>{edge.label ?? EDGE_KIND_STYLES[edge.kind].label}</span>
      </button>
    </li>
  );
}

export function EdgePanel({
  architecture,
  index,
  edge,
  actions,
}: {
  architecture: Architecture;
  index: ArchitectureIndex;
  edge: ArchEdge;
  actions: PanelActions;
}) {
  const from = index.nodes.get(edge.from);
  const to = index.nodes.get(edge.to);
  const usages = flowUsages(index, [edge.id]);
  return (
    <>
      <div className={styles.eyebrow}>{EDGE_KIND_STYLES[edge.kind].label} connection</div>
      <h2 className={styles.title}>
        {edge.label ?? `${from?.name ?? edge.from} → ${to?.name ?? edge.to}`}
      </h2>
      <div className={styles.route}>
        {from && <NodeRef node={from} onSelect={actions.select} />}
        <ArrowRight size={16} className={styles.arrowIcon} />
        {to && <NodeRef node={to} onSelect={actions.select} />}
      </div>
      {edge.description && <Markdown>{edge.description}</Markdown>}
      <SourceList sources={edge.sources} project={architecture.project} />
      <FlowUsageList usages={usages} actions={actions} />
    </>
  );
}

export function StepPanel({
  index,
  flow,
  stepIndex,
  actions,
}: {
  index: ArchitectureIndex;
  flow: ArchFlow;
  stepIndex: number;
  actions: PanelActions;
}) {
  const step = flow.steps[stepIndex]!;
  const edge = index.edges.get(step.edge);
  const ends = stepEndpoints(index, flow, stepIndex);
  const from = ends && index.nodes.get(ends.from);
  const to = ends && index.nodes.get(ends.to);

  return (
    <>
      <div className={`${styles.eyebrow} ${styles.eyebrowText}`}>
        {flow.name} · Step {stepIndex + 1} of {flow.steps.length}
      </div>
      <h2 className={styles.title}>{step.title}</h2>
      <div className={styles.route}>
        {from && <NodeRef node={from} onSelect={actions.select} />}
        <ArrowRight size={16} className={styles.arrowIcon} />
        {to && <NodeRef node={to} onSelect={actions.select} />}
      </div>
      <div className={styles.chips} style={{ marginBottom: 14 }}>
        {edge && (
          <button type="button" className={styles.chip} onClick={() => actions.select(edge.id)}>
            {EDGE_KIND_STYLES[edge.kind].label}
            {edge.label ? ` · ${edge.label}` : ""}
          </button>
        )}
        {step.async && (
          <span className={styles.badge}>
            <Zap size={12} /> async
          </span>
        )}
        {step.reverse && (
          <span className={styles.badge}>
            <Undo2 size={12} /> response
          </span>
        )}
        {step.durationMs !== undefined && (
          <span className={styles.badge}>
            <Clock size={12} /> ~{formatDuration(step.durationMs)}
          </span>
        )}
      </div>
      {step.description && <Markdown>{step.description}</Markdown>}
      {step.payload !== undefined && (
        <Section title="Payload">
          <JsonView value={step.payload} />
        </Section>
      )}
      <Section title="About this flow">
        <dl className={styles.meta}>
          <dt>Trigger</dt>
          <dd>{flow.trigger}</dd>
          <dt>Summary</dt>
          <dd>{flow.summary}</dd>
        </dl>
      </Section>
    </>
  );
}
