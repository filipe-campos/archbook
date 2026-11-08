import type { ArchFlow, ArchitectureIndex } from "@archbook/schema";

export interface FlowUsage {
  flow: ArchFlow;
  /** 1-based step numbers, ascending. */
  steps: number[];
}

/** Flows with a step on any of the edges, in document order. */
export function flowUsages(index: ArchitectureIndex, edgeIds: Iterable<string>): FlowUsage[] {
  const steps = new Map<ArchFlow, Set<number>>();
  for (const edgeId of edgeIds) {
    for (const { flow, stepIndex } of index.stepsByEdge.get(edgeId) ?? []) {
      const numbers = steps.get(flow) ?? new Set<number>();
      steps.set(flow, numbers.add(stepIndex + 1));
    }
  }
  return [...index.flows.values()].flatMap((flow) => {
    const numbers = steps.get(flow);
    return numbers ? [{ flow, steps: [...numbers].sort((a, b) => a - b) }] : [];
  });
}
