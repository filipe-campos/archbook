import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { askQuestions, initCommand, parseLines } from "../src/commands/init.js";
import { defaultsPrompter } from "../src/io/prompter.js";
import { tempProject, testContext } from "./helpers.js";

describe("init", () => {
  it("accepts only http(s) repository URLs", async () => {
    let validate: ((value: string) => string | undefined) | undefined;
    await askQuestions(
      {
        ...defaultsPrompter,
        text: async (options) => {
          if (options.message.startsWith("Repository URL")) validate = options.validate;
          return options.defaultValue ?? "";
        },
      },
      tempProject(),
    );
    expect(validate).toBeDefined();
    for (const value of ["", "https://github.com/o/r", "http://localhost:8080/repo"]) {
      expect(validate!(value)).toBeUndefined();
    }
    for (const value of ["javascript:alert(1)", "data:text/html,x", "file:///repo", "github.com"]) {
      expect(validate!(value)).toMatch(/http or https/);
    }
  });

  it("parses free-text lists", () => {
    expect(parseLines("- checkout\n\n2. user signup\n  * Stripe webhook  \n")).toEqual([
      "checkout",
      "user signup",
      "Stripe webhook",
    ]);
  });
});

describe("initCommand", () => {
  it("installs with the defaults and reports what it wrote", async () => {
    const context = testContext(tempProject({ "package.json": '{ "name": "demo" }\n' }));
    const runGeneration = vi.fn(async () => 0);

    expect(await initCommand({ yes: true }, context, runGeneration)).toBe(0);
    expect(runGeneration).not.toHaveBeenCalled();
    const { events } = context.output;
    expect(events[0]).toMatchObject({ kind: "intro", text: /archbook init/ });
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "note", title: "Detected stack" }),
    );
    const installed = events.find((event) => event.title === "Installed");
    expect(installed?.text).toMatch(/archbook\/config\.json/);
    expect(installed?.text).toMatch(/archbook\/\.manifest\.json/);
    expect(events.at(-1)).toMatchObject({ kind: "outro", text: /npx archbook generate/ });
    expect(existsSync(path.join(context.cwd, "archbook/config.json"))).toBe(true);
  });

  it("runs the generation when asked to", async () => {
    const context = testContext(tempProject());
    const runGeneration = vi.fn(async () => 1);
    expect(await initCommand({ yes: true, generate: true }, context, runGeneration)).toBe(1);
    expect(runGeneration).toHaveBeenCalledOnce();
    expect(context.output.events.at(-1)!.text).not.toMatch(/npx archbook generate/);
  });
});
