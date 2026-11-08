import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  ArchbookConfigSchema,
  CONFIG_SCHEMA_URL,
  DEFAULT_HISTORY_LIMIT,
  SCHEMA_VERSION,
  type ArchbookConfig,
  type Audience,
  type DetailLevel,
  type DetectedSignal,
} from "@archbook/schema";
import { readTextIfExists, sha256, writeFileAtomic, writeJson } from "../io/fs.js";
import { VERSION, pluginDir } from "../package.js";
import { planAssets, type Asset } from "./assets.js";
import { ManifestRecorder } from "./manifest.js";
import { ARCHBOOK_DIR, resolveInside, type ProjectPaths } from "./project.js";
import { GITIGNORE_HEADER, GITIGNORE_LINES, textToAppend } from "./textBlock.js";

export interface InitAnswers {
  name: string;
  description: string;
  audience: Audience;
  language: string;
  detailLevel: DetailLevel;
  flows: string[];
  externalContext?: string;
  ignore: string[];
  repoUrl?: string;
  defaultBranch: string;
}

export interface InstallReport {
  configWritten: boolean;
  created: string[];
  updated: string[];
  replaced: string[];
  skipped: string[];
  unchanged: string[];
  gitignore: "added" | "present";
}

export function buildConfig(answers: InitAnswers, detected: DetectedSignal[]): ArchbookConfig {
  return ArchbookConfigSchema.parse({
    $schema: CONFIG_SCHEMA_URL,
    version: SCHEMA_VERSION,
    project: {
      name: answers.name,
      description: answers.description,
      ...(answers.repoUrl ? { repoUrl: answers.repoUrl } : {}),
      defaultBranch: answers.defaultBranch,
    },
    audience: answers.audience,
    language: answers.language,
    detailLevel: answers.detailLevel,
    flows: answers.flows,
    ...(answers.externalContext ? { externalContext: answers.externalContext } : {}),
    ignore: answers.ignore,
    detected,
    history: { limit: DEFAULT_HISTORY_LIMIT },
  });
}

/** Creates each missing directory between the root and `relativeDir`, recording the new ones. */
function ensureDirectory(root: string, relativeDir: string, recorder: ManifestRecorder): void {
  let current = "";
  for (const segment of relativeDir.split("/").filter(Boolean)) {
    current = current ? `${current}/${segment}` : segment;
    const absolute = path.join(root, current);
    if (!existsSync(absolute)) {
      mkdirSync(absolute);
      recorder.record({ path: current, change: "created-dir" });
    }
  }
}

async function installAsset(
  root: string,
  asset: Asset,
  recorder: ManifestRecorder,
  report: InstallReport,
  confirmOverwrite?: (file: string) => Promise<boolean>,
): Promise<void> {
  const absolute = resolveInside(root, asset.target);
  const hash = sha256(asset.content);
  const existing = readTextIfExists(absolute);
  const entry = recorder.get(asset.target);

  if (existing === undefined) {
    ensureDirectory(root, path.posix.dirname(asset.target), recorder);
    writeFileAtomic(absolute, asset.content);
    recorder.record({ path: asset.target, change: "created", hash });
    report.created.push(asset.target);
    return;
  }
  if (existing === asset.content) {
    report.unchanged.push(asset.target);
    return;
  }
  const ours = entry && (entry.change === "created" || entry.change === "replaced");
  if (ours && sha256(existing) === entry.hash) {
    writeFileAtomic(absolute, asset.content);
    recorder.record({ path: asset.target, change: "created", hash });
    report.updated.push(asset.target);
    return;
  }
  const overwrite = (await confirmOverwrite?.(asset.target)) ?? false;
  if (!overwrite) {
    report.skipped.push(asset.target);
    return;
  }
  writeFileAtomic(absolute, asset.content);
  recorder.record(
    ours
      ? { path: asset.target, change: "created", hash }
      : { path: asset.target, change: "replaced", hash, original: existing },
  );
  report.replaced.push(asset.target);
}

/**
 * Writes the config, copies the Claude Code assets and updates .gitignore, recording everything.
 * `confirmOverwrite` decides about existing files with other content; without it they are kept.
 */
export async function performInit(
  paths: ProjectPaths,
  config: ArchbookConfig | undefined,
  options: { pluginRoot?: string; confirmOverwrite?: (file: string) => Promise<boolean> } = {},
): Promise<InstallReport> {
  const recorder = new ManifestRecorder(paths, VERSION);
  const report: InstallReport = {
    configWritten: false,
    created: [],
    updated: [],
    replaced: [],
    skipped: [],
    unchanged: [],
    gitignore: "present",
  };

  ensureDirectory(paths.root, ARCHBOOK_DIR, recorder);
  if (config) {
    writeJson(paths.config, config);
    report.configWritten = true;
  }

  for (const asset of planAssets(options.pluginRoot ?? pluginDir())) {
    await installAsset(paths.root, asset, recorder, report, options.confirmOverwrite);
  }

  const gitignore = path.join(paths.root, ".gitignore");
  const before = readTextIfExists(gitignore);
  const appended = textToAppend(before, GITIGNORE_LINES, GITIGNORE_HEADER);
  if (appended) {
    const content = (before ?? "") + appended;
    writeFileAtomic(gitignore, content);
    recorder.record({
      path: ".gitignore",
      change: "modified",
      hash: sha256(content),
      appended,
      createdFile: before === undefined,
    });
    report.gitignore = "added";
  }

  recorder.save();
  return report;
}
