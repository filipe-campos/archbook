import { describe, expect, it } from "vitest";
import { plural } from "../src/index.js";
import { suggest } from "../src/text.js";

describe("plural", () => {
  it("adds an s unless the count is one", () => {
    expect(plural(0, "node")).toBe("0 nodes");
    expect(plural(1, "node")).toBe("1 node");
    expect(plural(2, "node")).toBe("2 nodes");
  });

  it("takes an explicit plural form", () => {
    expect(plural(1, "entry", "entries")).toBe("1 entry");
    expect(plural(3, "entry", "entries")).toBe("3 entries");
  });
});

describe("suggest", () => {
  it("names a close candidate", () => {
    expect(suggest("orders-ap", ["orders-api", "payments"])).toBe(' Did you mean "orders-api"?');
  });

  it("stays silent when nothing is close", () => {
    expect(suggest("billing", ["orders-api", "web-app"])).toBe("");
    expect(suggest("billing", [])).toBe("");
  });
});
