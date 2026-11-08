import { existsSync } from "node:fs";
import pc from "picocolors";
import { CancelledError, UserError } from "../errors.js";
import { ASSET_PREFIX, PLUGIN_NAME } from "../core/assets.js";
import { relativePath } from "../core/project.js";
import { executeRemoval, planRemoval } from "../core/removal.js";
import { pluginUninstallCommands } from "../io/claude.js";
import { bullet, command } from "../ui/format.js";
import { describePlan } from "../ui/removal.js";
import { resolvePaths, type CommandContext } from "./context.js";

export interface RemoveOptions {
  keepDocs?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

export async function removeCommand(
  options: RemoveOptions,
  context: CommandContext,
): Promise<number> {
  const { prompter, output } = context;
  const paths = resolvePaths(context);
  const plan = planRemoval(paths, { keepDocs: options.keepDocs });
  output.intro(pc.bgRed(pc.white(" archbook remove ")));

  if (plan.items.filter((item) => item.action !== "delete-dir-if-empty").length === 0) {
    output.outro(`Nothing to remove in ${paths.root}.`);
    return 0;
  }
  if (plan.mode === "conservative") {
    output.warn(
      "No archbook/.manifest.json found, so Archbook cannot tell exactly what it installed.\n" +
        `Only archbook/ and files starting with "${ASSET_PREFIX}" in .claude/ are removed. Edit .gitignore yourself if needed.`,
    );
  }
  output.note(describePlan(plan), options.dryRun ? "Would remove" : "Will remove");
  if (options.dryRun) {
    output.outro("Dry run: nothing was changed.");
    return 0;
  }

  // Without a manifest there is no way to tell user files apart, so a person must always confirm.
  const mustAsk = plan.mode === "conservative" || !options.yes;
  if (mustAsk) {
    if (!prompter.interactive) {
      throw new UserError(
        plan.mode === "conservative"
          ? "Without a manifest, removal needs an interactive confirmation. Run it in a terminal."
          : "Add --yes to confirm in a non-interactive shell.",
      );
    }
    if (!(await prompter.confirm({ message: "Remove these files?", initialValue: false })))
      throw new CancelledError();
  }

  const result = await executeRemoval(paths, plan, {
    confirmEdited:
      prompter.interactive && !options.yes
        ? (file) =>
            prompter.confirm({
              message: `${file} was edited after Archbook installed it. Delete it anyway?`,
              initialValue: false,
            })
        : undefined,
  });

  const summary = [
    result.removed.length ? `Removed ${result.removed.length} item(s).` : "",
    result.restored.length ? `Restored your original ${result.restored.join(", ")}.` : "",
    result.reverted.length ? `Removed Archbook's lines from ${result.reverted.join(", ")}.` : "",
  ].filter(Boolean);
  output.success(summary.join("\n") || "Done.");
  if (result.kept.length) {
    output.warn(
      `Kept files you edited:\n${result.kept.map(bullet).join("\n")}\nDelete them by hand if you no longer need them.`,
    );
  }
  for (const warning of result.warnings) output.warn(warning);
  if (result.backup) output.info(`Backup of everything removed: ${pc.cyan(result.backup)}`);
  if (options.keepDocs && existsSync(paths.architecture)) {
    output.info(
      `Kept ${relativePath(paths.root, paths.architecture)}; ${command("npx archbook dev")} and ${command("build")} still work.`,
    );
  }
  const uninstall = pluginUninstallCommands(PLUGIN_NAME);
  if (uninstall.length) {
    output.info(
      `The Archbook plugin is also installed in Claude Code. To remove it:\n${uninstall.map((c) => `  ${command(c)}`).join("\n")}`,
    );
  }
  output.outro("Archbook removed.");
  return 0;
}
