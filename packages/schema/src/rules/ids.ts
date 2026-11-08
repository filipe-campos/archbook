import type { Rule } from "./context.js";

export const duplicateIds: Rule = ({ doc, report }) => {
  const collections = [
    ["groups", "group", doc.groups],
    ["nodes", "node", doc.nodes],
    ["edges", "edge", doc.edges],
    ["flows", "flow", doc.flows],
  ] as const;
  for (const [key, label, items] of collections) {
    const firstIndex = new Map<string, number>();
    items.forEach((item, index) => {
      const first = firstIndex.get(item.id);
      if (first === undefined) firstIndex.set(item.id, index);
      else {
        report(
          "duplicate-id",
          [key, index, "id"],
          `Duplicate ${label} id "${item.id}" (already used by ${key}[${first}]).`,
        );
      }
    });
  }
};
