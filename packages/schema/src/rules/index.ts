import { eachItem, type Rule } from "./context.js";
import { duplicateEdge, edgeEnds, selfLoopEdge } from "./edges.js";
import { flowSteps } from "./flows.js";
import { emptyGroup, groupParent } from "./groups.js";
import { duplicateIds } from "./ids.js";
import { isolatedNode, nodeGroup, nodeWithoutSources } from "./nodes.js";
import { edgeSources, nodeSources } from "./sources.js";

/** Semantic rules in report order. Reordering them reorders the issues users and tests see. */
export const RULES: readonly Rule[] = [
  duplicateIds,
  eachItem("groups", groupParent),
  eachItem("nodes", nodeGroup, nodeSources),
  eachItem("edges", edgeEnds, edgeSources, selfLoopEdge, duplicateEdge),
  eachItem("flows", flowSteps),
  eachItem("nodes", isolatedNode, nodeWithoutSources),
  eachItem("groups", emptyGroup),
];
