import path from "node:path";
import { describeToolUse, type StreamMessage } from "../../io/claude.js";
import { pluginAssetName } from "../assets.js";

export interface StreamState {
  /** Subagent name by the id of the tool call that started it. */
  agents: Map<string, string>;
}

export const createStreamState = (): StreamState => ({ agents: new Map() });

export interface ProgressLine {
  kind: "tool" | "text";
  /** Subagent that produced the line; absent for the main session. */
  agent?: string;
  text: string;
}

const TEXT_LIMIT = 160;

/** Progress lines for one stream message; remembers subagents so their lines can be labelled. */
export function describeStreamMessage(
  message: StreamMessage,
  state: StreamState,
  options: { verbose?: boolean; root: string },
): ProgressLine[] {
  if (message.type !== "assistant") return [];
  const agent = message.parent_tool_use_id
    ? state.agents.get(message.parent_tool_use_id)
    : undefined;
  const lines: ProgressLine[] = [];
  for (const block of message.message.content) {
    if (block.type === "tool_use" && block.name) {
      if ((block.name === "Agent" || block.name === "Task") && block.id) {
        state.agents.set(
          block.id,
          String(block.input?.subagent_type ?? "subagent").replace(pluginAssetName(""), ""),
        );
      }
      const text = describeToolUse(block.name, block.input).replace(options.root + path.sep, "");
      lines.push({ kind: "tool", agent, text });
    } else if (block.type === "text" && block.text && (options.verbose || !agent)) {
      const firstLine = block.text.trim().split("\n")[0] ?? "";
      if (firstLine) lines.push({ kind: "text", agent, text: firstLine.slice(0, TEXT_LIMIT) });
    }
  }
  return lines;
}
