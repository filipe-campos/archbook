import { readFileSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import type { Architecture } from "../packages/schema/src/index.ts";

export const repoRoot = path.resolve(import.meta.dirname, "..");
export const examplePath = path.join(repoRoot, "examples/shop-checkout");
export const example = JSON.parse(
  readFileSync(path.join(examplePath, "archbook/architecture.json"), "utf8"),
) as Architecture;

interface PageProblems {
  console: string[];
  csp: string[];
}

declare global {
  interface Window {
    __cspViolations: string[];
  }
}

/** Fails the test on console errors, uncaught exceptions and Content Security Policy violations. */
export const test = base.extend<{ problems: PageProblems }>({
  problems: [
    async ({ page }, use) => {
      const problems: PageProblems = { console: [], csp: [] };
      await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          window.__cspViolations.push(
            `${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}:${event.columnNumber} ${event.sample}`,
          );
        });
      });
      page.on("console", (message) => {
        if (message.type() === "error") problems.console.push(message.text());
      });
      page.on("pageerror", (error) => problems.console.push(String(error)));
      await use(problems);
      problems.csp.push(...(await cspViolations(page)));
      expect(problems.console, "console errors").toEqual([]);
      expect(problems.csp, "CSP violations").toEqual([]);
    },
    { auto: true },
  ],
});

const cspViolations = (page: Page) =>
  page.evaluate(() => window.__cspViolations ?? []).catch(() => [] as string[]);

export const archNodes = (page: Page) => page.locator(".react-flow__node-arch");
export const detailsPanel = (page: Page) => page.getByRole("complementary", { name: "Details" });

export { expect };
