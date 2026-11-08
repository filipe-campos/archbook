import type { NodeKind } from "../architecture.js";
import { suggest } from "../text.js";
import type { ElementRule } from "./context.js";

/** Node kinds that usually have no code of their own in the project. */
const SOURCELESS_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(["external", "actor"]);

export const nodeGroup: ElementRule<"nodes"> = ({ doc, index, report }, node, position) => {
  if (node.group === undefined || index.groups.has(node.group)) return;
  const groupIds = doc.groups.map((group) => group.id);
  report(
    "unknown-group",
    ["nodes", position, "group"],
    `Node "${node.id}" references unknown group "${node.group}".${suggest(node.group, groupIds)}`,
  );
};

export const isolatedNode: ElementRule<"nodes"> = ({ index, report }, node, position) => {
  if (index.outgoing.has(node.id) || index.incoming.has(node.id)) return;
  report("isolated-node", ["nodes", position], `Node "${node.id}" has no edges.`);
};

export const nodeWithoutSources: ElementRule<"nodes"> = ({ report }, node, position) => {
  if (node.sources.length > 0 || SOURCELESS_KINDS.has(node.kind)) return;
  report(
    "node-without-sources",
    ["nodes", position, "sources"],
    `Node "${node.id}" (${node.kind}) has no sources. Point to the code or config that defines it.`,
  );
};
