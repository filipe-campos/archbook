import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { UserError } from "../errors.js";
import { validateProject } from "../core/validation.js";
import { command } from "../ui/format.js";
import { formatValidation } from "../ui/validation.js";
import { VERSION, viewerDir } from "../package.js";
import { resolvePaths, type CommandContext } from "./context.js";

/** Marks a folder as produced by `archbook build`, so rebuilding may safely replace it. */
const BUILD_MARKER = ".archbook-build";

export function buildCommand(options: { out?: string }, { cwd, output }: CommandContext): number {
  const paths = resolvePaths({ cwd });
  const result = validateProject(paths);
  if (!result.valid) {
    output.line(formatValidation(result));
    throw new UserError("Fix the errors above before building.");
  }
  const out = options.out ? path.resolve(cwd, options.out) : paths.dist;
  if (existsSync(out)) {
    const entries = readdirSync(out);
    if (entries.length > 0 && !entries.includes(BUILD_MARKER)) {
      throw new UserError(
        `${out} is not empty and was not created by "archbook build". Choose another --out folder.`,
      );
    }
    rmSync(out, { recursive: true, force: true });
  }
  cpSync(viewerDir(), out, { recursive: true });
  cpSync(paths.architecture, path.join(out, "architecture.json"));
  writeFileSync(path.join(out, BUILD_MARKER), `archbook@${VERSION}\n`);
  // Lets GitHub Pages serve the folder as-is.
  writeFileSync(path.join(out, ".nojekyll"), "");

  const shown = path.relative(process.cwd(), out) || ".";
  output.line(formatValidation(result));
  output.line(`${pc.green("✔")} Static site written to ${pc.cyan(shown)}`);
  output.line(
    pc.dim(
      `  Preview it with ${command(`npx serve ${shown}`)} or publish the folder to any static host.`,
    ),
  );
  return 0;
}
