import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateGeneration } from "../src/core/generation/outcome.js";
import type { GenerationSession } from "../src/core/generation/session.js";
import { createStreamState, describeStreamMessage } from "../src/core/generation/stream.js";
import type { ProjectValidation } from "../src/core/validation.js";
import type { ResultMessage, StreamMessage } from "../src/io/claude.js";

const root = path.join(path.sep, "work", "shop");

const assistant = (
  content: Extract<StreamMessage, { type: "assistant" }>["message"]["content"],
  parent?: string,
): StreamMessage => ({ type: "assistant", parent_tool_use_id: parent, message: { content } });

describe("describeStreamMessage", () => {
  it("describes tool calls without the project root", () => {
    const state = createStreamState();
    const message = assistant([
      { type: "tool_use", name: "Read", input: { file_path: path.join(root, "src/a.ts") } },
    ]);
    expect(describeStreamMessage(message, state, { root })).toEqual([
      { kind: "tool", agent: undefined, text: "Reading src/a.ts" },
    ]);
  });

  it("labels the lines of nested agents with the agent's name", () => {
    const state = createStreamState();
    const started = describeStreamMessage(
      assistant([
        {
          type: "tool_use",
          id: "t1",
          name: "Agent",
          input: { subagent_type: "archbook:scanner", description: "map services" },
        },
      ]),
      state,
      { root },
    );
    expect(started).toEqual([
      expect.objectContaining({ kind: "phase", text: "Mapping components and connections" }),
      { kind: "tool", agent: undefined, text: "Starting archbook:scanner: map services" },
    ]);
    expect(state.agents.get("t1")).toBe("scanner");

    const nested = assistant(
      [
        { type: "tool_use", id: "t2", name: "Task", input: {} },
        { type: "tool_use", name: "Grep", input: { pattern: "express" } },
      ],
      "t1",
    );
    expect(describeStreamMessage(nested, state, { root })).toEqual([
      { kind: "tool", agent: "scanner", text: "Starting subagent: " },
      { kind: "tool", agent: "scanner", text: "Searching for express" },
    ]);
    expect(state.agents.get("t2")).toBe("subagent");
  });

  it("starts a phase when the session launches an agent or a phase subcommand", () => {
    const state = createStreamState();
    const phases = (content: Parameters<typeof assistant>[0], parent?: string): string[] =>
      describeStreamMessage(assistant(content, parent), state, { root })
        .filter((line) => line.kind === "phase")
        .map((line) => line.text);
    const agent = (id: string, type: string) =>
      ({ type: "tool_use", id, name: "Agent", input: { subagent_type: type } }) as const;
    const bash = (command: string) =>
      ({ type: "tool_use", name: "Bash", input: { command } }) as const;

    expect(phases([bash("npx archbook snapshot --op generate")])).toEqual(["Saving a snapshot"]);
    expect(phases([agent("a", "archbook-scanner")])).toEqual([
      "Mapping components and connections",
    ]);
    expect(state.agents.get("a")).toBe("scanner");
    expect(
      phases([agent("b", "archbook:flow-tracer"), agent("c", "archbook:flow-tracer")]),
    ).toEqual(["Tracing flows"]);
    expect(phases([bash("archbook merge --draft archbook/.drafts/flow-checkout.json")])).toEqual([
      "Merging the drafts",
    ]);
    expect(phases([agent("d", "archbook:writer")])).toEqual(["Writing the descriptions"]);
    expect(phases([bash("archbook validate")], "d")).toEqual([]);
    expect(phases([agent("e", "archbook:curator")])).toEqual(["Polishing the presentation"]);
    expect(phases([agent("f", "archbook:validator"), bash("archbook validate")])).toEqual([
      "Checking every reference against the code",
    ]);
    expect(phases([agent("g", "general-purpose"), bash("archbook format"), bash("ls")])).toEqual(
      [],
    );
  });

  it("shows the first line of text, and the text of agents only when verbose", () => {
    const state = createStreamState();
    state.agents.set("t1", "writer");
    const long = `  ${"x".repeat(200)}\nsecond line`;
    expect(
      describeStreamMessage(assistant([{ type: "text", text: long }]), state, { root }),
    ).toEqual([{ kind: "text", agent: undefined, text: "x".repeat(160) }]);

    const nested = assistant([{ type: "text", text: "Drafting nodes\nmore" }], "t1");
    expect(describeStreamMessage(nested, state, { root })).toEqual([]);
    expect(describeStreamMessage(nested, state, { root, verbose: true })).toEqual([
      { kind: "text", agent: "writer", text: "Drafting nodes" },
    ]);
  });

  it("ignores empty text and messages other than assistant ones", () => {
    const state = createStreamState();
    expect(
      describeStreamMessage(assistant([{ type: "text", text: "  \n" }]), state, { root }),
    ).toEqual([]);
    expect(describeStreamMessage({ type: "user" }, state, { root })).toEqual([]);
    expect(describeStreamMessage({ type: "system", subtype: "status" }, state, { root })).toEqual(
      [],
    );
  });
});

describe("evaluateGeneration", () => {
  const result: ResultMessage = { type: "result", subtype: "success", is_error: false };
  const session = (overrides: Partial<GenerationSession> = {}): GenerationSession => ({
    interrupted: false,
    fellBack: false,
    code: 0,
    result,
    stderr: "",
    ...overrides,
  });
  const validation = (valid: boolean): ProjectValidation => ({
    file: "archbook/architecture.json",
    missing: false,
    valid,
    errors: [],
    warnings: [],
  });
  const written = { text: "{}", schemaValid: true, validation: validation(true) };

  it("reports an interruption before anything else", () => {
    expect(
      evaluateGeneration({ ...written, session: session({ interrupted: true, code: 1 }) }),
    ).toEqual({ kind: "interrupted" });
  });

  it.each([
    ["the result's errors", { result: { ...result, is_error: true, errors: ["a", "b"] } }, "a\nb"],
    [
      "the result's text",
      { result: { ...result, is_error: true, result: "Out of turns" } },
      "Out of turns",
    ],
    ["the end of stderr", { code: 1, stderr: "1\n2\n3\n4\n5\n6\n" }, "2\n3\n4\n5\n6"],
    ["the handler's error", { code: 1, handlerError: new Error("boom") }, "Error: boom"],
    ["the exit code", { code: 2, result: undefined }, "exit code 2"],
  ])("fails with %s as the reason", (_, overrides, reason) => {
    expect(evaluateGeneration({ ...written, session: session(overrides) })).toEqual({
      kind: "failed",
      reason,
    });
  });

  it("reports a missing or schema-invalid file as malformed", () => {
    expect(evaluateGeneration({ session: session(), text: undefined, schemaValid: false })).toEqual(
      {
        kind: "malformed",
        missing: true,
      },
    );
    expect(evaluateGeneration({ session: session(), text: "{", schemaValid: false })).toEqual({
      kind: "malformed",
      missing: false,
    });
  });

  it("keeps a file with validation errors and reports it as invalid", () => {
    const invalid = validation(false);
    expect(evaluateGeneration({ ...written, session: session(), validation: invalid })).toEqual({
      kind: "invalid",
      result,
      validation: invalid,
    });
  });

  it("succeeds when the file is valid", () => {
    expect(evaluateGeneration({ ...written, session: session() })).toMatchObject({
      kind: "success",
      result,
    });
  });
});
