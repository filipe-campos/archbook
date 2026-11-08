import { existsSync } from "node:fs";
import pc from "picocolors";
import { UserError } from "../errors.js";
import { validateProject } from "../core/validation.js";
import { openBrowser } from "../io/browser.js";
import { startDevServer } from "../io/server.js";
import { command } from "../ui/format.js";
import { formatValidation } from "../ui/validation.js";
import { viewerDir } from "../package.js";
import { resolvePaths, type CommandContext } from "./context.js";

export async function devCommand(
  options: { port: number; host?: string; open?: boolean },
  context: CommandContext,
): Promise<number> {
  const { output } = context;
  const paths = resolvePaths(context);
  if (!existsSync(paths.dir)) {
    throw new UserError(
      `No archbook/ folder in ${paths.root}. Run ${command("archbook init")} first.`,
    );
  }
  const report = () => {
    const result = validateProject(paths);
    output.line(
      result.missing
        ? pc.yellow(`Waiting for ${result.file}... (run ${command("archbook generate")})`)
        : formatValidation(result),
    );
  };
  report();
  const server = await startDevServer({
    viewerDir: viewerDir(),
    architectureFile: paths.architecture,
    port: options.port,
    host: options.host,
    onChange: () => {
      output.line(
        pc.dim(`\n${new Date().toLocaleTimeString()} architecture.json changed, reloading`),
      );
      report();
    },
  });
  output.line(
    `\n  ${pc.bold("Archbook")} running at ${pc.cyan(server.url)}\n  ${pc.dim("Live reload is on. Press Ctrl+C to stop.")}\n`,
  );
  if (options.open) openBrowser(server.url);

  await new Promise<void>((resolve) => {
    const stop = () => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      void server.close().then(resolve);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  return 0;
}
