import { describe, expect, it } from "vitest";
import { tokenizeJson } from "../src/lib/jsonTokens";
import { clampStep, formatDuration, stepTiming } from "../src/lib/playback";
import { formatHash, parseHash, type Route } from "../src/lib/route";
import { safeHref } from "../src/lib/safeUrl";
import { searchNodes } from "../src/lib/search";
import { formatSourceLabel, sourceUrl } from "../src/lib/sourceUrl";
import { example } from "./example";

describe("route", () => {
  it.each<[string, Route]>([
    ["", { view: "overview" }],
    ["#/", { view: "overview" }],
    ["#/flow/checkout", { view: "flow", flowId: "checkout", step: 1 }],
    ["#/flow/checkout/step/3", { view: "flow", flowId: "checkout", step: 3 }],
    ["#/node/orders-api", { view: "node", id: "orders-api" }],
    ["#/edge/web-to-api", { view: "edge", id: "web-to-api" }],
    ["#/flow/checkout/step/0", { view: "overview" }],
    ["#/flow/checkout/step/x", { view: "overview" }],
    ["#/flow/Bad_Id", { view: "overview" }],
    ["#/somewhere/else", { view: "overview" }],
  ])("parses %s", (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  it("round-trips routes", () => {
    const routes: Route[] = [
      { view: "overview" },
      { view: "node", id: "orders-api" },
      { view: "edge", id: "a-to-b" },
      { view: "flow", flowId: "checkout", step: 4 },
    ];
    for (const route of routes) expect(parseHash(formatHash(route))).toEqual(route);
  });
});

describe("playback timing", () => {
  it("clamps real durations to a watchable range and scales by speed", () => {
    expect(stepTiming({ durationMs: 5 }, 1).travelMs).toBe(600);
    expect(stepTiming({ durationMs: 60_000 }, 1).travelMs).toBe(2400);
    expect(stepTiming({ durationMs: 1000 }, 1)).toEqual({ travelMs: 1000, dwellMs: 2800 });
    expect(stepTiming({ durationMs: 1000 }, 2)).toEqual({ travelMs: 500, dwellMs: 1400 });
    expect(stepTiming({}, 0.5).travelMs).toBe(1800);
  });

  it("keeps step numbers inside the flow", () => {
    expect(clampStep(0, 5)).toBe(1);
    expect(clampStep(9, 5)).toBe(5);
    expect(clampStep(3, 5)).toBe(3);
  });

  it("formats durations", () => {
    expect(formatDuration(5)).toBe("5 ms");
    expect(formatDuration(1800)).toBe("1.8 s");
    expect(formatDuration(42_000)).toBe("42 s");
    expect(formatDuration(90_000)).toBe("1.5 min");
  });
});

describe("sourceUrl", () => {
  const source = { path: "src/app.ts", lines: [10, 20] as [number, number] };

  it("builds GitHub links with line anchors", () => {
    expect(sourceUrl("https://github.com/o/r.git", "main", source)).toBe(
      "https://github.com/o/r/blob/main/src/app.ts#L10-L20",
    );
    expect(sourceUrl("https://github.com/o/r/", "dev", { path: "./a b.ts", lines: [3, 3] })).toBe(
      "https://github.com/o/r/blob/dev/a%20b.ts#L3",
    );
    expect(sourceUrl("https://github.com/o/r", "main", { path: "src" })).toBe(
      "https://github.com/o/r/blob/main/src",
    );
  });

  it("uses GitLab and Bitbucket URL shapes", () => {
    expect(sourceUrl("https://gitlab.com/o/r", "main", source)).toBe(
      "https://gitlab.com/o/r/-/blob/main/src/app.ts#L10-20",
    );
    expect(sourceUrl("https://bitbucket.org/o/r", "main", source)).toBe(
      "https://bitbucket.org/o/r/src/main/src/app.ts#lines-10:20",
    );
  });

  it("formats labels", () => {
    expect(formatSourceLabel(source)).toBe("src/app.ts:10-20");
    expect(formatSourceLabel({ path: "a.ts", lines: [4, 4] })).toBe("a.ts:4");
    expect(formatSourceLabel({ path: "a.ts" })).toBe("a.ts");
  });
});

describe("safeHref", () => {
  it.each(["https://github.com/o/r", "http://localhost:3000/a?b=1#c", "HTTPS://Example.com/x"])(
    "keeps %s",
    (url) => {
      expect(safeHref(url)).toBe(new URL(url).href);
    },
  );

  it.each([
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "\tjavascript:alert(1)",
    "data:text/html,<b>x</b>",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "/relative/path",
    "not a url",
    "",
  ])("rejects %j", (url) => {
    expect(safeHref(url)).toBeUndefined();
  });
});

describe("tokenizeJson", () => {
  it("classifies every token and preserves the text", () => {
    const text = JSON.stringify({ a: "x", b: [1, -2.5e3, true, null], 'c"d': {} }, null, 2);
    const tokens = tokenizeJson(text);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
    const typed = (type: string) => tokens.filter((t) => t.type === type).map((t) => t.text);
    expect(typed("key")).toEqual(['"a"', '"b"', '"c\\"d"']);
    expect(typed("string")).toEqual(['"x"']);
    expect(typed("number")).toEqual(["1", "-2500"]);
    expect(typed("boolean")).toEqual(["true"]);
    expect(typed("null")).toEqual(["null"]);
  });
});

describe("searchNodes", () => {
  it("ranks name matches above technology and summary matches", () => {
    const names = (q: string) => searchNodes(example.nodes, q).map((node) => node.id);
    expect(names("redis")[0]).toBe("redis");
    expect(names("redis")).toEqual(
      expect.arrayContaining(["payments-queue", "notifications-worker"]),
    );
    expect(names("express")).toEqual(["orders-api"]);
    expect(names("  ")).toEqual([]);
  });
});
