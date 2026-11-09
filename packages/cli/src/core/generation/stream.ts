import path from "node:path";
import { describeToolUse, type StreamMessage } from "../../io/claude.js";
import { ASSET_PREFIX, PLUGIN_NAME } from "../assets.js";

export type GenerationPhaseId =
  "snapshot" | "scan" | "trace" | "merge" | "write" | "curate" | "validate";

export interface GenerationPhase {
  id: GenerationPhaseId;
  title: string;
}

/** The passes of a generation, in the order the plugin commands run them. */
export const GENERATION_PHASES: readonly GenerationPhase[] = [
  { id: "snapshot", title: "Saving a snapshot" },
  { id: "scan", title: "Mapping components and connections" },
  { id: "trace", title: "Tracing flows" },
  { id: "merge", title: "Merging the drafts" },
  { id: "write", title: "Writing the descriptions" },
  { id: "curate", title: "Polishing the presentation" },
  { id: "validate", title: "Checking every reference against the code" },
];

const PHASE_BY_AGENT: Record<string, GenerationPhaseId> = {
  scanner: "scan",
  "flow-tracer": "trace",
  writer: "write",
  curator: "curate",
  validator: "validate",
};

const PHASE_BY_SUBCOMMAND: Record<string, GenerationPhaseId> = {
  snapshot: "snapshot",
  merge: "merge",
  validate: "validate",
};

export interface StreamState {
  /** Subagent name by the id of the tool call that started it. */
  agents: Map<string, string>;
  phase?: GenerationPhaseId;
}

export const createStreamState = (): StreamState => ({ agents: new Map() });

export type ProgressLine =
  | {
      kind: "tool" | "text";
      /** Subagent that produced the line; absent for the main session. */
      agent?: string;
      text: string;
    }
  | { kind: "phase"; phase: GenerationPhase; text: string };

const TEXT_LIMIT = 160;

const agentName = (subagentType: unknown) =>
  String(subagentType ?? "subagent").replace(
    new RegExp(`^(?:${PLUGIN_NAME}:|${ASSET_PREFIX})`),
    "",
  );

const SUBCOMMAND = /^(?:npx\s+)?archbook\s+([a-z-]+)/;

/** The phase a top-level tool call starts, if any. */
function phaseOf(name: string, input: Record<string, unknown> = {}): GenerationPhaseId | undefined {
  if (name === "Agent" || name === "Task") return PHASE_BY_AGENT[agentName(input.subagent_type)];
  if (name === "Bash" && typeof input.command === "string") {
    const subcommand = SUBCOMMAND.exec(input.command.trim())?.[1];
    return subcommand ? PHASE_BY_SUBCOMMAND[subcommand] : undefined;
  }
  return undefined;
}

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
      // Only the orchestrating session moves the phase; agents also run validate on their own.
      const phaseId = message.parent_tool_use_id ? undefined : phaseOf(block.name, block.input);
      if (phaseId && phaseId !== state.phase) {
        state.phase = phaseId;
        const phase = GENERATION_PHASES.find((candidate) => candidate.id === phaseId)!;
        lines.push({ kind: "phase", phase, text: phase.title });
      }
      if ((block.name === "Agent" || block.name === "Task") && block.id) {
        state.agents.set(block.id, agentName(block.input?.subagent_type));
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
