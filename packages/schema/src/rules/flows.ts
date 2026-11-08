import { stepEndpoints } from "../indexing.js";
import { suggest } from "../text.js";
import type { ElementRule } from "./context.js";

export const flowSteps: ElementRule<"flows"> = ({ doc, index, report }, flow, flowIndex) => {
  // A synchronous call returns to its caller implicitly, so a step may start from any node the
  // flow already reached, not only from the previous step's target.
  const reached = new Set<string>();
  flow.steps.forEach((step, stepIndex) => {
    const ends = stepEndpoints(index, flow, stepIndex);
    if (!ends) {
      const edgeIds = doc.edges.map((edge) => edge.id);
      report(
        "unknown-edge",
        ["flows", flowIndex, "steps", stepIndex, "edge"],
        `Flow "${flow.id}" step ${stepIndex + 1} references unknown edge "${step.edge}".${suggest(step.edge, edgeIds)}`,
      );
      return;
    }
    if (stepIndex > 0 && !step.async && reached.size > 0 && !reached.has(ends.from)) {
      report(
        "discontinuous-flow",
        ["flows", flowIndex, "steps", stepIndex],
        `Flow "${flow.id}" step ${stepIndex + 1} ("${step.title}") starts at "${ends.from}", which no earlier step reached. Add the missing step, or mark this step async.`,
      );
    }
    reached.add(ends.from);
    reached.add(ends.to);
  });
};
