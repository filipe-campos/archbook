import { existsSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import {
  DEFAULT_IGNORE,
  HttpUrlSchema,
  LanguageTagSchema,
  type ArchbookConfig,
  type Audience,
  type DetailLevel,
} from "@archbook/schema";
import { projectCommand } from "../core/assets.js";
import { loadConfig } from "../core/config.js";
import { detectStack, projectDefaults } from "../core/detect.js";
import { buildConfig, performInit, type InitAnswers } from "../core/install.js";
import { projectPaths } from "../core/project.js";
import { GITIGNORE_LINES } from "../core/textBlock.js";
import { INSTALL_HINT, claudeVersion } from "../io/claude.js";
import { gitDefaultBranch, gitRemoteUrl } from "../io/git.js";
import type { Prompter } from "../io/prompter.js";
import { bullet, command, commandList } from "../ui/format.js";
import { VERSION } from "../package.js";
import type { CommandContext } from "./context.js";

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
    message: "Describe it in one sentence",
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
      validate: (value) => LanguageTagSchema.safeParse(value.trim()).error?.issues[0]?.message,
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
        "Which 3 to 5 flows matter most? They become replayable stories. One per line, Enter twice to finish.",
      placeholder: "checkout\nuser signup\nStripe webhook",
      defaultValue: "",
    }),
  );
  const externalContext = await prompter.multiline({
    message: "Anything the code does not show? External systems, infrastructure (optional)",
    placeholder: "e.g. Cloudflare in front of the API, a data warehouse fed nightly by Fivetran",
    defaultValue: "",
  });
  const ignore = (
    await prompter.text({
      message: "Folders to skip (comma-separated)",
      defaultValue: DEFAULT_IGNORE.join(", "),
    })
  )
    .split(",")
    .map((folder) => folder.trim())
    .filter(Boolean);
  const detectedRepo = gitRemoteUrl(root);
  const repoUrl = await prompter.text({
    message: "Repository URL, so every component links to its code (optional)",
    defaultValue: detectedRepo ?? "",
    placeholder: detectedRepo ?? "https://github.com/owner/repo",
    validate: (value) =>
      !value.trim() || HttpUrlSchema.safeParse(value.trim()).success
        ? undefined
        : "Enter a full http or https URL, or leave it empty",
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

export interface InitCommandOptions {
  yes?: boolean;
  generate?: boolean;
}

export async function initCommand(
  options: InitCommandOptions,
  { cwd, prompter, output }: CommandContext,
  runGeneration: () => Promise<number>,
): Promise<number> {
  const root = path.resolve(cwd);
  const paths = projectPaths(root);
  output.intro(
    `${pc.bgMagenta(pc.white(pc.bold(" archbook init ")))}  ${pc.dim(`v${VERSION} · living architecture docs, written by Claude Code`)}`,
  );

  const claude = claudeVersion();
  if (claude) output.success(`Claude Code found (${claude}).`);
  else {
    output.warn(
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
  output.note(
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

  const report = await performInit(paths, config, {
    confirmOverwrite: prompter.interactive
      ? (file) =>
          prompter.confirm({
            message: `${file} already exists with different content. Overwrite it?`,
            initialValue: false,
          })
      : undefined,
  });
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
  output.note(lines.join("\n"), "Installed");
  if (report.skipped.length) {
    output.warn(`Kept your existing version of:\n${report.skipped.map(bullet).join("\n")}`);
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

  const steps: Array<[string, string]> = [
    ...(wantsGeneration
      ? []
      : ([
          [
            "npx archbook generate",
            `write the docs (or ${projectCommand("generate")} in Claude Code)`,
          ],
        ] as Array<[string, string]>)),
    ["npx archbook dev", "open the viewer with live reload"],
    [`${projectCommand("add-flow")} <flow>`, "document one more flow"],
    [projectCommand("sync"), "update the docs after code changes"],
    ["npx archbook validate", "check hand edits to archbook/architecture.json"],
  ];
  output.outro(`${pc.bold("Next steps")}\n${commandList(steps)}`);
  return exitCode;
}
