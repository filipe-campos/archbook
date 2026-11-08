import type { HtmlTagDescriptor } from "vite";
import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, contentSecurityPolicy } from "../csp";

describe("contentSecurityPolicy", () => {
  it("adds the policy to the built page only", () => {
    const plugin = contentSecurityPolicy();
    expect(plugin.apply).toBe("build");
    const transform = plugin.transformIndexHtml as () => HtmlTagDescriptor[];
    expect(transform()).toEqual([
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend",
      },
    ]);
  });

  it("allows no eval, inline scripts, plugins or foreign origins", () => {
    const directives = new Map(
      CONTENT_SECURITY_POLICY.split("; ").map((directive) => {
        const [name, ...sources] = directive.split(" ");
        return [name!, sources];
      }),
    );
    expect(directives.get("script-src")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'none'"]);
    for (const sources of directives.values()) {
      expect(sources).not.toContain("'unsafe-eval'");
      expect(sources).not.toContain("*");
    }
  });
});
