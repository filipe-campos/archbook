import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Architecture } from "../packages/schema/src/index.ts";
import { archNodes, detailsPanel, examplePath, expect, repoRoot, test } from "./fixtures.ts";

let project: string;
let server: ChildProcess;
let url: string;

test.beforeAll(async () => {
  project = path.join(mkdtempSync(path.join(tmpdir(), "archbook-e2e-dev-")), "shop-checkout");
  cpSync(examplePath, project, { recursive: true });
  server = spawn(
    process.execPath,
    [path.join(repoRoot, "packages/cli/dist/index.js"), "dev", "--port", "4420", "--cwd", project],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  url = await new Promise<string>((resolve, reject) => {
    let output = "";
    server.stdout!.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
      const match = /running at (http\S+)/.exec(stripVTControlCharacters(output));
      if (match) resolve(match[1]!);
    });
    server.on("exit", (code) => reject(new Error(`archbook dev exited with ${code}:\n${output}`)));
  });
});

test.afterAll(async () => {
  server?.kill();
  if (project) rmSync(path.dirname(project), { recursive: true, force: true });
});

test("reloads when architecture.json changes", async ({ page }) => {
  const file = path.join(project, "archbook/architecture.json");
  const document = JSON.parse(readFileSync(file, "utf8")) as Architecture;
  const node = document.nodes.find((candidate) => candidate.kind === "service")!;

  await page.goto(`${url}#/node/${node.id}`);
  await expect(archNodes(page)).toHaveCount(document.nodes.length);
  await expect(detailsPanel(page)).toContainText(node.summary);

  const summary = "Edited while the dev server was running.";
  node.summary = summary;
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);

  await expect(detailsPanel(page)).toContainText(summary);
});
