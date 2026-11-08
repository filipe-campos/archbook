import { describe, expect, it } from "vitest";
import type { ValidationIssue } from "@archbook/schema";
import { createRequestSequence, nextLoadState, type LoadState } from "../src/lib/loadState";
import { example } from "./example";

const errors: ValidationIssue[] = [
  { severity: "error", code: "schema", path: ["nodes", 0, "id"], message: "Required" },
];
const ready: LoadState = { status: "ready", architecture: example, warnings: [] };

describe("nextLoadState", () => {
  it("shows the error screen when the first load is invalid or missing", () => {
    expect(nextLoadState({ status: "loading" }, { status: "invalid", errors })).toEqual({
      status: "invalid",
      errors,
    });
    expect(nextLoadState({ status: "loading" }, { status: "missing", message: "404" })).toEqual({
      status: "missing",
      message: "404",
    });
  });

  it("keeps the last valid document when a reload is invalid or missing", () => {
    expect(nextLoadState(ready, { status: "invalid", errors })).toEqual({
      ...ready,
      reloadError: { kind: "invalid", errors },
    });
    const missing = nextLoadState(ready, { status: "missing", message: "404 Not Found" });
    expect(missing).toEqual({
      ...ready,
      reloadError: { kind: "missing", message: "404 Not Found" },
    });
  });

  it("clears the reload error when a valid reload arrives", () => {
    const failed = nextLoadState(ready, { status: "invalid", errors });
    const next = nextLoadState(failed, { status: "ready", architecture: example, warnings: [] });
    expect(next).toEqual(ready);
    expect(next).not.toHaveProperty("reloadError");
  });

  it("replaces an error screen with the first valid document", () => {
    const invalid = nextLoadState({ status: "loading" }, { status: "invalid", errors });
    expect(
      nextLoadState(invalid, { status: "ready", architecture: example, warnings: [] }),
    ).toEqual(ready);
  });
});

describe("createRequestSequence", () => {
  it("ignores responses that arrive after a newer request started", async () => {
    const sequence = createRequestSequence();
    let shown: string | undefined;
    const request = (value: string, delay: number) => {
      const id = sequence.next();
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          if (sequence.isLatest(id)) shown = value;
          resolve();
        }, delay),
      );
    };
    await Promise.all([request("old", 30), request("new", 5)]);
    expect(shown).toBe("new");
  });
});
