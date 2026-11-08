import { useCallback } from "react";
import type { ArchFlow, ArchitectureIndex } from "@archbook/schema";
import type { Navigate } from "../data/useHashRoute";
import { clampStep } from "../lib/playback";
import type { Route } from "../lib/route";

export interface FlowRoute {
  flow: ArchFlow | undefined;
  /** 0-based index of the step on screen, or -1 without a flow. */
  stepIndex: number;
  /** Identifies the step on screen, if a flow is open. */
  stepKey: string | undefined;
  /** Moves to a 0-based step, kept inside the flow, without adding history entries. */
  goTo: (stepIndex: number) => void;
}

export function useFlowRoute(
  index: ArchitectureIndex,
  route: Route,
  navigate: Navigate,
): FlowRoute {
  const flow = route.view === "flow" ? index.flows.get(route.flowId) : undefined;
  const stepIndex =
    flow && route.view === "flow" ? clampStep(route.step, flow.steps.length) - 1 : -1;

  const goTo = useCallback(
    (next: number) => {
      if (!flow) return;
      const step = clampStep(next + 1, flow.steps.length);
      navigate({ view: "flow", flowId: flow.id, step }, { replace: true });
    },
    [flow, navigate],
  );

  return { flow, stepIndex, stepKey: flow ? `${flow.id}:${stepIndex}` : undefined, goTo };
}
