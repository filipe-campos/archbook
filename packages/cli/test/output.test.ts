import * as clack from "@clack/prompts";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { plainOutput, terminalOutput } from "../src/io/output.js";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  taskLog: vi.fn(() => ({ message: vi.fn(), success: vi.fn(), error: vi.fn() })),
  log: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("plainOutput", () => {
  let log: MockInstance<typeof console.log>;
  let error: MockInstance<typeof console.error>;

  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("sends messages to clack", () => {
    plainOutput.intro("title");
    plainOutput.outro("done");
    plainOutput.info("i");
    plainOutput.success("s");
    plainOutput.warn("w");
    plainOutput.error("e");
    plainOutput.note("body", "heading");

    expect(clack.intro).toHaveBeenCalledWith("title");
    expect(clack.outro).toHaveBeenCalledWith("done");
    expect(clack.log.info).toHaveBeenCalledWith("i");
    expect(clack.log.success).toHaveBeenCalledWith("s");
    expect(clack.log.warn).toHaveBeenCalledWith("w");
    expect(clack.log.error).toHaveBeenCalledWith("e");
    expect(clack.note).toHaveBeenCalledWith("body", "heading");
  });

  it("keeps lines and JSON on stdout and error lines on stderr", () => {
    plainOutput.line("row");
    plainOutput.json({ ok: true });
    plainOutput.errorLine("warning");

    expect(log.mock.calls).toEqual([["row"], ['{\n  "ok": true\n}']]);
    expect(error.mock.calls).toEqual([["warning"]]);
  });

  it("prints progress as plain indented lines, with failures on stderr", () => {
    const progress = plainOutput.progress("Working", 5);
    progress.message("step");
    progress.success("finished");
    progress.error("broke");

    expect(log.mock.calls).toEqual([["Working"], ["  step"], ["finished"]]);
    expect(error.mock.calls).toEqual([["broke"]]);
  });
});

describe("terminalOutput", () => {
  it("shows progress as a live clack log", () => {
    terminalOutput.progress("Working", 5);
    expect(clack.taskLog).toHaveBeenCalledWith({ title: "Working", limit: 5 });
  });
});
