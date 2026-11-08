import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DetectedSignal } from "@archbook/schema";
import { loadPackageRules, type PackageRule } from "./recipes.js";

interface FileRule {
  name: string;
  /** Matched against the file name, or against the whole relative path when it contains "/". */
  patterns: string[];
  recipe?: string;
}

export const FILE_RULES: readonly FileRule[] = [
  { name: "Node.js", patterns: ["package.json"] },
  { name: "pnpm workspace", patterns: ["pnpm-workspace.yaml"] },
  { name: "Turborepo", patterns: ["turbo.json"] },
  { name: "Nx", patterns: ["nx.json"] },
  { name: "Go", patterns: ["go.mod"] },
  { name: "Python", patterns: ["pyproject.toml", "requirements.txt"] },
  { name: "Java (Maven)", patterns: ["pom.xml"] },
  { name: "Rust", patterns: ["Cargo.toml"] },
  {
    name: "Docker Compose",
    patterns: ["docker-compose*.yml", "docker-compose*.yaml", "compose.yml", "compose.yaml"],
    recipe: "docker-compose.md",
  },
  { name: "Docker", patterns: ["Dockerfile", "*.Dockerfile"] },
  { name: "Serverless Framework", patterns: ["serverless.yml", "serverless.yaml"] },
  { name: "Terraform", patterns: ["*.tf"] },
  { name: "GitHub Actions", patterns: [".github/workflows/*.yml", ".github/workflows/*.yaml"] },
];

const ALWAYS_SKIPPED = new Set([
  "node_modules",
  ".git",
  "archbook",
  ".claude",
  ".next",
  ".turbo",
  "coverage",
]);
const MAX_DEPTH = 4;
const MAX_ENTRIES = 20_000;
const MAX_FILES_PER_SIGNAL = 8;

function matches(pattern: string, relative: string): boolean {
  const subject = pattern.includes("/") ? relative : path.posix.basename(relative);
  const regex = new RegExp(
    `^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`,
  );
  return regex.test(subject);
}

/** Lists project files breadth-first, skipping ignored folders and stopping at a size cap. */
export function listProjectFiles(root: string, ignore: readonly string[] = []): string[] {
  const skipped = new Set([...ALWAYS_SKIPPED, ...ignore]);
  const files: string[] = [];
  const queue: Array<[string, number]> = [["", 0]];
  let seen = 0;
  while (queue.length > 0 && seen < MAX_ENTRIES) {
    const [dir, depth] = queue.shift()!;
    let entries;
    try {
      entries = readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (++seen > MAX_ENTRIES) break;
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!skipped.has(entry.name) && depth < MAX_DEPTH) queue.push([relative, depth + 1]);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  }
  return files;
}

/**
 * Heuristic stack detection from file names and package.json dependencies. No AI involved.
 * Package rules come from the frontmatter of the detection recipes.
 */
export function detectStack(
  root: string,
  ignore: readonly string[] = [],
  packageRules: readonly PackageRule[] = loadPackageRules(),
): DetectedSignal[] {
  const files = listProjectFiles(root, ignore);
  const signals: DetectedSignal[] = [];

  for (const rule of FILE_RULES) {
    const found = files.filter((file) => rule.patterns.some((pattern) => matches(pattern, file)));
    if (found.length > 0) {
      signals.push({
        name: rule.name,
        files: found.slice(0, MAX_FILES_PER_SIGNAL),
        ...(rule.recipe ? { recipe: rule.recipe } : {}),
      });
    }
  }

  const byLibrary = new Map<string, Set<string>>();
  for (const manifest of files
    .filter((file) => path.posix.basename(file) === "package.json")
    .slice(0, 50)) {
    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(readFileSync(path.join(root, manifest), "utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    const deps = new Set(
      ["dependencies", "devDependencies", "peerDependencies"].flatMap((key) =>
        Object.keys((pkg[key] as Record<string, string> | undefined) ?? {}),
      ),
    );
    for (const rule of packageRules) {
      if (rule.packages.some((name) => deps.has(name))) {
        const set = byLibrary.get(rule.name) ?? new Set<string>();
        set.add(manifest);
        byLibrary.set(rule.name, set);
      }
    }
  }
  for (const rule of packageRules) {
    const manifests = byLibrary.get(rule.name);
    if (!manifests) continue;
    signals.push({
      name: rule.name,
      files: [...manifests].slice(0, MAX_FILES_PER_SIGNAL),
      recipe: rule.recipe,
    });
  }
  return signals;
}

export interface ProjectDefaults {
  name: string;
  description: string;
}

/** Suggested name and description from package.json, the README, or the folder name. */
export function projectDefaults(root: string): ProjectDefaults {
  let name = path.basename(path.resolve(root));
  let description = "";
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      name?: string;
      description?: string;
    };
    if (pkg.name) name = pkg.name.replace(/^@[^/]+\//, "");
    if (pkg.description) description = pkg.description;
  } catch {
    // No package.json: keep the folder name.
  }
  if (!description) description = readmeSummary(root) ?? "";
  return { name, description };
}

function readmeSummary(root: string): string | undefined {
  for (const file of ["README.md", "readme.md", "README"]) {
    let text: string;
    try {
      text = readFileSync(path.join(root, file), "utf8");
    } catch {
      continue;
    }
    const paragraph = text
      .split(/\r?\n\s*\r?\n/)
      .map((block) => block.trim())
      .find((block) => block && !/^(#|!\[|\[!|<|```|---|\|)/.test(block));
    if (!paragraph) return undefined;
    const flat = paragraph.replace(/\s+/g, " ").replace(/[*_`]/g, "");
    return flat.length > 200 ? `${flat.slice(0, 197).trimEnd()}...` : flat;
  }
  return undefined;
}
