import type { ArchNode } from "@archbook/schema";

/** Ranks nodes for a query: name prefix, then name, id, technology, and finally summary matches. */
export function searchNodes(nodes: readonly ArchNode[], query: string): ArchNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<[number, ArchNode]> = [];
  for (const node of nodes) {
    const name = node.name.toLowerCase();
    let score = 0;
    if (name.startsWith(q)) score = 5;
    else if (name.includes(q)) score = 4;
    else if (node.id.includes(q)) score = 3;
    else if (node.tech.some((tech) => tech.toLowerCase().includes(q))) score = 2;
    else if (node.summary.toLowerCase().includes(q)) score = 1;
    if (score > 0) scored.push([score, node]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name))
    .map(([, node]) => node);
}
