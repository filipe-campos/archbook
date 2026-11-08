import { findProjectRoot, projectPaths, type ProjectPaths } from "../core/project.js";
import type { Output } from "../io/output.js";
import type { Prompter } from "../io/prompter.js";

/** What every command receives from `cli.ts`; tests build one with a memory output. */
export interface CommandContext {
  cwd: string;
  /** Both stdin and stdout are terminals, so questions can be asked. */
  interactive: boolean;
  prompter: Prompter;
  output: Output;
}

export const resolvePaths = (context: Pick<CommandContext, "cwd">): ProjectPaths =>
  projectPaths(findProjectRoot(context.cwd));
