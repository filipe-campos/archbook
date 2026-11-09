import pc from "picocolors";
import type { GenerationPhase, ProgressLine } from "../core/generation/stream.js";
import { command, table } from "./format.js";

export function formatProgressLine(line: Extract<ProgressLine, { kind: "tool" | "text" }>): string {
  const prefix = line.agent ? pc.dim(`[${line.agent}] `) : "";
  return prefix + (line.kind === "text" ? pc.dim(line.text) : line.text);
}

/** `42s`, `3m 05s`, `1h 02m`. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** The line a finished phase leaves behind once its live log clears. */
export const formatPhaseDone = (title: string, elapsedMs: number): string =>
  `${title}  ${pc.dim(formatElapsed(elapsedMs))}`;

export function formatGenerationPlan(phases: readonly GenerationPhase[]): string {
  const steps = phases
    .filter((phase) => phase.id !== "snapshot" && phase.id !== "merge")
    .map((phase, index) => `${pc.magenta(String(index + 1))}  ${phase.title}`);
  return [
    ...steps,
    "",
    pc.dim(`A snapshot of the current docs is saved first, so ${command("archbook undo")}`),
    pc.dim("brings them back. Ctrl+C stops the run and restores them."),
  ].join("\n");
}

export interface GenerationSummary {
  nodes: number;
  edges: number;
  flows: number;
  groups: number;
  changes: string;
  elapsedMs: number;
  costUsd?: number;
  warnings: number;
}

export function formatGenerationSummary(summary: GenerationSummary): string {
  const counts = [
    `${pc.bold(String(summary.nodes))} components`,
    `${pc.bold(String(summary.edges))} connections`,
    `${pc.bold(String(summary.flows))} flows`,
    `${pc.bold(String(summary.groups))} groups`,
  ].join(pc.dim("  ·  "));
  const time =
    formatElapsed(summary.elapsedMs) +
    (summary.costUsd !== undefined ? pc.dim(` · $${summary.costUsd.toFixed(2)}`) : "");
  const rows = [
    [pc.dim("Changes"), summary.changes],
    [pc.dim("Time"), time],
    ...(summary.warnings ? [[pc.dim("Warnings"), pc.yellow(String(summary.warnings))]] : []),
  ];
  return `${counts}\n\n${table(rows)}`;
}
