import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Prefix that namespaces Archbook files inside a project's .claude/ folder. */
export const ASSET_PREFIX = "archbook-";
/** Name of the plugin; plugin assets reference each other as `archbook:<name>`. */
export const PLUGIN_NAME = "archbook";

/** `archbook-<name>`: the asset's name once copied into a project's `.claude/`. */
export const projectAssetName = (name: string) => `${ASSET_PREFIX}${name}`;
/** `archbook:<name>`: the asset's name inside the plugin. */
export const pluginAssetName = (name: string) => `${PLUGIN_NAME}:${name}`;
/** `/archbook-<name>`, as typed in Claude Code after `archbook init`. */
export const projectCommand = (name: string) => `/${projectAssetName(name)}`;
/** `/archbook:<name>`, as typed in Claude Code with the plugin installed. */
export const pluginCommand = (name: string) => `/${pluginAssetName(name)}`;

type AssetKind = "command" | "agent" | "skill";

export interface Asset {
  kind: AssetKind;
  /** Plugin-mode name, e.g. `generate` (invoked as `/archbook:generate`). */
  name: string;
  /** Destination relative to the project root, e.g. `.claude/commands/archbook-generate.md`. */
  target: string;
  content: string;
}

const listDir = (dir: string) => {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
};

function filesUnder(dir: string, prefix = ""): string[] {
  return listDir(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    const relative = prefix ? `${prefix}/${entry}` : entry;
    return statSync(full).isDirectory() ? filesUnder(full, relative) : [relative];
  });
}

/**
 * Plans the copy of the plugin's commands, agents and skills into `.claude/`. Plugin names become
 * prefixed names (`archbook:scanner` -> `archbook-scanner`) because `.claude/` has no namespaces.
 */
export function planAssets(pluginRoot: string): Asset[] {
  const raw: Array<Omit<Asset, "content"> & { source: string }> = [];

  for (const file of listDir(path.join(pluginRoot, "commands")).filter((f) => f.endsWith(".md"))) {
    const name = file.slice(0, -3);
    raw.push({
      kind: "command",
      name,
      source: path.join(pluginRoot, "commands", file),
      target: `.claude/commands/${ASSET_PREFIX}${file}`,
    });
  }
  for (const file of listDir(path.join(pluginRoot, "agents")).filter((f) => f.endsWith(".md"))) {
    const name = file.slice(0, -3);
    raw.push({
      kind: "agent",
      name,
      source: path.join(pluginRoot, "agents", file),
      target: `.claude/agents/${ASSET_PREFIX}${file}`,
    });
  }
  for (const skill of listDir(path.join(pluginRoot, "skills"))) {
    const dir = path.join(pluginRoot, "skills", skill);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of filesUnder(dir)) {
      raw.push({
        kind: "skill",
        name: skill,
        source: path.join(dir, file),
        target: `.claude/skills/${ASSET_PREFIX}${skill}/${file}`,
      });
    }
  }

  const names = new Set(raw.map((asset) => asset.name));
  return raw.map(({ source, ...asset }) => {
    const text = readFileSync(source, "utf8");
    return { ...asset, content: source.endsWith(".md") ? rewriteForProject(text, names) : text };
  });
}

/** Turns plugin-mode references into project-mode names for a copy under `.claude/`. */
export function rewriteForProject(content: string, names: ReadonlySet<string>): string {
  const pattern = new RegExp(`\\b${PLUGIN_NAME}:([a-z0-9-]+)\\b`, "g");
  let result = content.replace(pattern, (match, name: string) =>
    names.has(name) ? `${ASSET_PREFIX}${name}` : match,
  );
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---/.exec(result);
  if (frontmatter) {
    const rewritten = frontmatter[0].replace(/^name:\s*([a-z0-9-]+)\s*$/m, (match, name: string) =>
      names.has(name) ? `name: ${ASSET_PREFIX}${name}` : match,
    );
    result = rewritten + result.slice(frontmatter[0].length);
  }
  return result;
}

/** Body of a command file without its frontmatter, with `$ARGUMENTS` filled in. */
export function commandPrompt(content: string, args = ""): string {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  return body.replaceAll("$ARGUMENTS", args).trim();
}
