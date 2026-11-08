import pc from "picocolors";
import type { ProgressLine } from "../core/generation/stream.js";

export function formatProgressLine(line: ProgressLine): string {
  const prefix = line.agent ? pc.dim(`[${line.agent}] `) : "";
  return prefix + (line.kind === "text" ? pc.dim(line.text) : line.text);
}
