import { suggest } from "../text.js";
import type { ElementRule } from "./context.js";

export const groupParent: ElementRule<"groups"> = ({ doc, index, report }, group, position) => {
  if (group.parent === undefined) return;
  if (!index.groups.has(group.parent)) {
    const groupIds = doc.groups.map((candidate) => candidate.id);
    report(
      "unknown-group",
      ["groups", position, "parent"],
      `Group "${group.id}" has unknown parent "${group.parent}".${suggest(group.parent, groupIds)}`,
    );
    return;
  }
  const visited = new Set<string>([group.id]);
  for (
    let current = index.groups.get(group.id)?.parent;
    current !== undefined;
    current = index.groups.get(current)?.parent
  ) {
    if (visited.has(current)) {
      report(
        "group-cycle",
        ["groups", position, "parent"],
        `Group "${group.id}" is part of a parent cycle.`,
      );
      break;
    }
    visited.add(current);
  }
};

export const emptyGroup: ElementRule<"groups"> = ({ index, report }, group, position) => {
  if (index.groupsWithNodes.has(group.id)) return;
  report(
    "empty-group",
    ["groups", position],
    `Group "${group.id}" has no nodes, so the viewer does not draw it. Move its nodes into it, or remove it.`,
  );
};
