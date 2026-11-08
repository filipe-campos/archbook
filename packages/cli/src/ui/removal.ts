import pc from "picocolors";
import { plural } from "@archbook/schema";
import type { ARCHBOOK_DIR } from "../core/project.js";
import type { RemovalGroup, RemovalItem, RemovalPlan } from "../core/removal.js";
import { bullet } from "./format.js";

// ui/ may only import types from core/; the type keeps this in step with the constant.
const archbookDir: typeof ARCHBOOK_DIR = "archbook";

const GROUP_TITLES: Record<RemovalGroup, string> = {
  docs: "Documentation",
  assets: "Claude Code assets",
  changes: "Changes to existing files",
};

export function describePlan(plan: RemovalPlan): string {
  const sections: string[] = [];
  for (const group of ["docs", "assets", "changes"] as const) {
    const items = plan.items.filter(
      (item) => item.group === group && item.action !== "delete-dir-if-empty",
    );
    if (items.length === 0) continue;
    // A skill is a folder of files: list it once, unless one of its files needs attention.
    const skillOf = (item: RemovalItem) =>
      item.action === "delete" && !item.edited
        ? /^\.claude\/skills\/[^/]+\//.exec(item.path)?.[0]
        : undefined;
    const counts = new Map<string, number>();
    for (const item of items) {
      const skill = skillOf(item);
      if (skill) counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
    const lines: string[] = [];
    for (const item of items) {
      const skill = skillOf(item);
      if (!skill) lines.push(describeItem(item));
      else if (counts.has(skill)) {
        const count = counts.get(skill)!;
        counts.delete(skill);
        lines.push(bullet(`${skill}${pc.dim(` (${plural(count, "file")})`)}`));
      }
    }
    sections.push(`${pc.bold(GROUP_TITLES[group])}\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

function describeItem(item: RemovalItem): string {
  const note =
    item.action === "restore"
      ? " (restore your original version)"
      : item.action === "revert-append"
        ? ` (remove the ${item.appended.trim().split("\n").length} lines Archbook added)`
        : item.path === archbookDir
          ? "/ (everything, including history and builds)"
          : "";
  const edited =
    "edited" in item && item.edited ? pc.yellow(" edited since install, will ask") : "";
  return bullet(`${item.path}${pc.dim(note)}${edited}`);
}
