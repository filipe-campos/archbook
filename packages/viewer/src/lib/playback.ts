import type { FlowStep } from "@archbook/schema";

export const SPEEDS = [0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

const DEFAULT_TRAVEL_MS = 900;
const MIN_TRAVEL_MS = 600;
const MAX_TRAVEL_MS = 2400;
/** Time to read the step title and glance at the payload after the particle arrives. */
const READING_MS = 1800;

export interface StepTiming {
  /** How long the particle takes to cross the edge. */
  travelMs: number;
  /** How long the step stays on screen before auto-advancing. */
  dwellMs: number;
}

/**
 * Real durations range from 1 ms to minutes, so they are clamped to a watchable range: slower
 * steps still look slower, but nothing flashes by or stalls the replay.
 */
export function stepTiming(step: Pick<FlowStep, "durationMs">, speed: number): StepTiming {
  const travel = Math.min(
    MAX_TRAVEL_MS,
    Math.max(MIN_TRAVEL_MS, step.durationMs ?? DEFAULT_TRAVEL_MS),
  );
  return { travelMs: travel / speed, dwellMs: (travel + READING_MS) / speed };
}

/** 1-based step number kept inside the flow. */
export function clampStep(step: number, stepCount: number): number {
  return Math.min(Math.max(1, Math.round(step)), Math.max(1, stepCount));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}
