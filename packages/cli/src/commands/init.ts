import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import {
  ArchbookConfigSchema,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_IGNORE,
  type ArchbookConfig,
  type Audience,
  type DetailLevel,
  type DetectedSignal,
} from "@archbook/schema";
import { planAssets, type Asset } from "../lib/assets.js";
import { claudeVersion, INSTALL_HINT } from "../lib/claude.js";
import { CONFIG_SCHEMA_URL, loadConfig } from "../lib/config.js";
import { detectStack, projectDefaults } from "../lib/detect.js";
import { readTextIfExists, sha256, writeFileAtomic, writeJson } from "../lib/fs.js";
import { gitDefaultBranch, gitRemoteUrl } from "../lib/git.js";
import { ManifestRecorder } from "../lib/manifest.js";
import { ARCHBOOK_DIR, projectPaths, type ProjectPaths } from "../lib/project.js";
import type { Prompter } from "../lib/prompter.js";
import { GITIGNORE_HEADER, GITIGNORE_LINES, textToAppend } from "../lib/textBlock.js";
import { bullet, command } from "../lib/ui.js";
import { VERSION, pluginDir } from "../package.js";
import type { GlobalOptions } from "./basic.js";

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

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "es", label: "Spanish" },
  { value: "other", label: "Other…" },
] as const;

/** Splits free text into one item per line, dropping list markers. */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

export async function askQuestions(prompter: Prompter, root: string): Promise<InitAnswers> {
  const defaults = projectDefaults(root);
  const name = await prompter.text({
    message: "Project name",
    defaultValue: defaults.name,
    validate: (value) => (value.trim() || defaults.name ? undefined : "Enter a name"),
  });
  const description = await prompter.text({
    message: "Short description (one sentence)",
    defaultValue: defaults.description,
    placeholder: defaults.description || "What does this system do?",
  });
  const audience = await prompter.select<Audience>({
    message: "Who will read the documentation?",
    options: [
      { value: "developers", label: "Developers", hint: "technical, with code references" },
      {
        value: "stakeholders",
        label: "Stakeholders",
        hint: "business responsibilities, no jargon",
      },
      { value: "mixed", label: "Mixed", hint: "business first, technical details after" },
    ],
    initialValue: "developers",
  });
  let language: string = await prompter.select({
    message: "Language of the documentation",
    options: LANGUAGES.map((option) => ({ ...option })),
    initialValue: "en",
  });
  if (language === "other") {
    language = await prompter.text({
      message: "Language code (BCP 47, e.g. fr, de, ja)",
      defaultValue: "en",
      validate: (value) =>
        /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(value.trim())
          ? undefined
          : "Use a code like fr or pt-BR",
    });
  }
  const detailLevel = await prompter.select<DetailLevel>({
    message: "Level of detail",
    options: [
      { value: "high-level", label: "High level", hint: "systems and external dependencies" },
      { value: "medium", label: "Medium", hint: "services, data stores and queues" },
      { value: "detailed", label: "Detailed", hint: "also the main modules inside services" },
    ],
    initialValue: "medium",
  });
  const flows = parseLines(
    await prompter.multiline({
      message:
        "What are the 3 to 5 most important flows? One per line (press Enter twice to finish).",
      placeholder: "checkout\nuser signup\nStripe webhook",
      defaultValue: "",
    }),
  );
  const externalContext = await prompter.multiline({
    message: "Any external systems or infrastructure that do not appear in the code? (optional)",
    placeholder: "e.g. Cloudflare in front of the API, a data warehouse fed nightly by Fivetran",
    defaultValue: "",
  });
  const ignore = (
    await prompter.text({
      message: "Folders to ignore (comma-separated)",
      defaultValue: DEFAULT_IGNORE.join(", "),
    })
  )
    .split(",")
    .map((folder) => folder.trim())
    .filter(Boolean);
  const detectedRepo = gitRemoteUrl(root);
  const repoUrl = await prompter.text({
    message: "Repository URL (to link components to their source files; optional)",
    defaultValue: detectedRepo ?? "",
    placeholder: detectedRepo ?? "https://github.com/owner/repo",
    validate: (value) => {
      if (!value.trim()) return undefined;
      try {
        new URL(value.trim());
        return undefined;
      } catch {
        return "Enter a full URL, or leave it empty";
      }
    },
  });

  return {
    name: name || defaults.name,
    description,
    audience,
    language: language.trim() || "en",
    detailLevel,
    flows,
    externalContext: externalContext.trim() || undefined,
    ignore,
    repoUrl: repoUrl.trim() || undefined,
    defaultBranch: gitDefaultBranch(root) ?? "main",
  };
}

export function buildConfig(answers: InitAnswers, detected: DetectedSignal[]): ArchbookConfig {
  return ArchbookConfigSchema.parse({
    $schema: CONFIG_SCHEMA_URL,
    version: "0.1",
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
  prompter: Prompter,
  report: InstallReport,
): Promise<void> {
  const absolute = path.join(root, asset.target);
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
  const overwrite =
    prompter.interactive &&
    (await prompter.confirm({
      message: `${asset.target} already exists with different content. Overwrite it?`,
      initialValue: false,
    }));
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

/** Writes the config, copies the Claude Code assets and updates .gitignore, recording everything. */
export async function performInit(
  paths: ProjectPaths,
  config: ArchbookConfig | undefined,
  prompter: Prompter,
  options: { pluginRoot?: string } = {},
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
    await installAsset(paths.root, asset, recorder, prompter, report);
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

export interface InitCommandOptions extends GlobalOptions {
  yes?: boolean;
  generate?: boolean;
}

export async function initCommand(
  options: InitCommandOptions,
  prompter: Prompter,
  runGeneration: () => Promise<number>,
): Promise<number> {
  const root = path.resolve(options.cwd);
  const paths = projectPaths(root);
  clack.intro(pc.bgMagenta(pc.white(" archbook init ")));

  const claude = claudeVersion();
  if (claude) clack.log.success(`Claude Code found (${claude}).`);
  else {
    clack.log.warn(
      `Claude Code is not installed. Install it with ${command(INSTALL_HINT)} to generate the docs.\n` +
        "You can continue: the commands are installed now and you can run them later.",
    );
  }

  const existingConfig = (() => {
    try {
      return loadConfig(paths);
    } catch {
      return undefined;
    }
  })();
  const detected = detectStack(root, existingConfig?.ignore ?? DEFAULT_IGNORE);
  clack.note(
    detected.length
      ? detected
          .map((signal) => `${pc.bold(signal.name)} ${pc.dim(signal.files.slice(0, 3).join(", "))}`)
          .join("\n")
      : "Nothing recognized; Claude Code will explore the code itself.",
    "Detected stack",
  );

  let config: ArchbookConfig | undefined;
  const reuse =
    existsSync(paths.config) &&
    !(await prompter.confirm({
      message: "archbook/config.json already exists. Answer the questions again and replace it?",
      initialValue: false,
    }));
  if (!reuse) config = buildConfig(await askQuestions(prompter, root), detected);

  const report = await performInit(paths, config, prompter);
  const lines = [
    report.configWritten
      ? bullet("archbook/config.json")
      : bullet(`archbook/config.json ${pc.dim("(kept)")}`),
    bullet(
      `${report.created.length + report.updated.length + report.replaced.length} Claude Code files in .claude/ ${pc.dim("(commands, agents, skills)")}`,
    ),
    report.gitignore === "added"
      ? bullet(`.gitignore ${pc.dim(`(+ ${GITIGNORE_LINES.join(", ")})`)}`)
      : "",
    bullet(`archbook/.manifest.json ${pc.dim("(what to undo on archbook remove)")}`),
  ].filter(Boolean);
  clack.note(lines.join("\n"), "Installed");
  if (report.skipped.length) {
    clack.log.warn(`Kept your existing version of:\n${report.skipped.map(bullet).join("\n")}`);
  }

  const wantsGeneration = options.yes
    ? options.generate === true
    : options.generate !== false &&
      claude !== undefined &&
      (await prompter.confirm({
        message: "Generate the documentation now with Claude Code?",
        initialValue: true,
      }));

  let exitCode = 0;
  if (wantsGeneration) exitCode = await runGeneration();

  clack.outro(
    [
      "Next steps:",
      wantsGeneration
        ? ""
        : `  ${command("npx archbook generate")}   generate the docs with Claude Code (or /archbook-generate inside Claude Code)`,
      `  ${command("npx archbook dev")}        open the viewer with live reload`,
      `  ${command("/archbook-add-flow")} ${pc.dim("<flow>")}  document another flow; ${command("/archbook-sync")} after code changes`,
      `  Edit ${command("archbook/architecture.json")} by hand any time; ${command("npx archbook validate")} checks it.`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return exitCode;
}
