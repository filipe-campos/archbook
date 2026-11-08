import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { removeCommand } from "../src/commands/remove.js";
import { UserError } from "../src/errors.js";
import { tempProject, testContext } from "./helpers.js";

async function installed(): Promise<string> {
  const root = tempProject({ "package.json": '{ "name": "demo" }\n' });
  await initCommand({ yes: true }, testContext(root), async () => 0);
  return root;
}

describe("removeCommand", () => {
  it("lists what would be removed on a dry run, and changes nothing", async () => {
    const root = await installed();
    const context = testContext(root);
    expect(await removeCommand({ dryRun: true }, context)).toBe(0);
    const plan = context.output.events.find((event) => event.kind === "note");
    expect(plan).toMatchObject({
      title: "Would remove",
      text: /\.claude\/commands\/archbook-generate\.md/,
    });
    expect(context.output.events.at(-1)).toEqual({
      kind: "outro",
      text: "Dry run: nothing was changed.",
    });
    expect(existsSync(path.join(root, "archbook"))).toBe(true);
  });

  it("needs --yes outside a terminal", async () => {
    const root = await installed();
    await expect(removeCommand({}, testContext(root))).rejects.toThrow(UserError);
    await expect(removeCommand({}, testContext(root))).rejects.toThrow(/--yes/);
    expect(existsSync(path.join(root, "archbook"))).toBe(true);
  });

  it("removes everything with --yes and says where the backup is", async () => {
    const root = await installed();
    const context = testContext(root);
    expect(await removeCommand({ yes: true }, context)).toBe(0);
    expect(existsSync(path.join(root, "archbook"))).toBe(false);
    const { events } = context.output;
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "success",
        text: expect.stringMatching(/^Removed \d+ item\(s\)\./),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "info",
        text: expect.stringMatching(/^Backup of everything removed: /),
      }),
    );
    expect(events.at(-1)).toEqual({ kind: "outro", text: "Archbook removed." });
    const backup = /Backup of everything removed: (.+)$/m.exec(context.output.text())![1]!;
    expect(existsSync(backup)).toBe(true);
    rmSync(backup);
  });

  it("has nothing to do in a project without Archbook", async () => {
    const context = testContext(tempProject());
    expect(await removeCommand({ yes: true }, context)).toBe(0);
    expect(context.output.events.at(-1)).toMatchObject({
      kind: "outro",
      text: /^Nothing to remove/,
    });
  });
});
