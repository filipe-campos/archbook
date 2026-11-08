import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ARCHITECTURE_SCHEMA_URL } from "@archbook/schema";
import { UserError } from "../src/errors.js";
import { VERSION } from "../src/package.js";
import {
  MINIMAL_CONFIG,
  examplePath,
  MINIMAL_SOURCES,
  minimalDocument,
  runCli,
  tempProject,
} from "./helpers.js";

const project = (document: string | null = minimalDocument()) =>
  tempProject({
    ...MINIMAL_SOURCES,
    "archbook/config.json": MINIMAL_CONFIG,
    ...(document === null ? {} : { "archbook/architecture.json": document }),
  });

const INVALID_DOCUMENT = minimalDocument().replace('"to": "api"', '"to": "nowhere"');

describe("validate", () => {
  it("reports a valid document with its counts and exits with 0", async () => {
    const { exitCode, output } = await runCli("validate", "--cwd", project());
    expect(exitCode).toBe(0);
    expect(output.text()).toBe("✔ archbook/architecture.json is valid (2 nodes, 1 edge, 0 flows)");
  });

  it("lists the errors of an invalid document and exits with 1", async () => {
    const { exitCode, output } = await runCli("validate", "--cwd", project(INVALID_DOCUMENT));
    expect(exitCode).toBe(1);
    expect(output.text()).toMatch(/^✖ archbook\/architecture\.json: 1 error/);
    expect(output.text()).toMatch(/edges\[0\]\.to .*nowhere.* \(unknown-node\)/);
  });

  it("prints only JSON with --json", async () => {
    const valid = await runCli("validate", "--json", "--cwd", project());
    expect(valid.exitCode).toBe(0);
    expect(valid.output.events.map((event) => event.kind)).toEqual(["json"]);
    expect(JSON.parse(valid.output.text())).toEqual({
      file: "archbook/architecture.json",
      valid: true,
      errors: [],
      warnings: [],
      stats: { nodes: 2, edges: 1, flows: 0, groups: 0 },
    });

    const invalid = await runCli("validate", "--json", "--cwd", project(INVALID_DOCUMENT));
    expect(invalid.exitCode).toBe(1);
    const report = JSON.parse(invalid.output.text()) as {
      valid: boolean;
      errors: Array<{ code: string }>;
    };
    expect(report.valid).toBe(false);
    expect(report.errors.map((issue) => issue.code)).toEqual(["unknown-node"]);
  });

  it("explains how to create a missing file", async () => {
    const { exitCode, output } = await runCli("validate", "--cwd", project(null));
    expect(exitCode).toBe(1);
    expect(output.text()).toMatch(/archbook\/architecture\.json/);
    expect(output.text()).toMatch(/Create it with archbook generate, or archbook init first\./);

    const json = await runCli("validate", "--json", "--cwd", project(null));
    expect(json.exitCode).toBe(1);
    expect(JSON.parse(json.output.text())).toMatchObject({ valid: false });
  });

  it("validates another file with --file, relative to --cwd", async () => {
    const root = project();
    writeFileSync(path.join(root, "draft.json"), INVALID_DOCUMENT);
    const { exitCode, output } = await runCli("validate", "--file", "draft.json", "--cwd", root);
    expect(exitCode).toBe(1);
    expect(output.text()).toMatch(/^✖ draft\.json: 1 error/);
  });
});

describe("build", () => {
  const files = (dir: string) => readdirSync(dir).sort();

  it("writes the viewer, the document, .nojekyll and the build marker", async () => {
    const root = project();
    const out = path.join(root, "site");
    const { exitCode, output } = await runCli("build", "--out", "site", "--cwd", root);
    expect(exitCode).toBe(0);
    expect(files(out)).toEqual(expect.arrayContaining(["index.html", "architecture.json"]));
    expect(readFileSync(path.join(out, "architecture.json"), "utf8")).toBe(minimalDocument());
    expect(readFileSync(path.join(out, ".nojekyll"), "utf8")).toBe("");
    expect(readFileSync(path.join(out, ".archbook-build"), "utf8")).toBe(`archbook@${VERSION}\n`);
    expect(output.text()).toMatch(/✔ Static site written to /);
  });

  it("refuses a non-empty folder it did not create", async () => {
    const root = project();
    mkdirSync(path.join(root, "site"));
    writeFileSync(path.join(root, "site/keep.txt"), "mine");
    const { error } = await runCli("build", "--out", "site", "--cwd", root);
    expect(error).toBeInstanceOf(UserError);
    expect(String(error)).toMatch(/is not empty and was not created by "archbook build"/);
    expect(files(path.join(root, "site"))).toEqual(["keep.txt"]);
  });

  it("replaces a folder it built before", async () => {
    const root = project();
    expect((await runCli("build", "--out", "site", "--cwd", root)).exitCode).toBe(0);
    writeFileSync(path.join(root, "site/stale.txt"), "old");
    expect((await runCli("build", "--out", "site", "--cwd", root)).exitCode).toBe(0);
    expect(existsSync(path.join(root, "site/stale.txt"))).toBe(false);
    expect(existsSync(path.join(root, "site/index.html"))).toBe(true);
  });

  it("does not build an invalid document", async () => {
    const root = project(INVALID_DOCUMENT);
    const { error, output } = await runCli("build", "--out", "site", "--cwd", root);
    expect(error).toBeInstanceOf(UserError);
    expect(String(error)).toMatch(/Fix the errors above before building/);
    expect(output.text()).toMatch(/\(unknown-node\)/);
    expect(existsSync(path.join(root, "site"))).toBe(false);
  });
});

describe("history", () => {
  it("lists each operation with what changed after it, newest first", async () => {
    const root = project(minimalDocument(["api"]));
    const write = (nodes: string[]) =>
      writeFileSync(path.join(root, "archbook/architecture.json"), minimalDocument(nodes));

    expect((await runCli("snapshot", "--op", "generate", "--cwd", root)).exitCode).toBe(0);
    write(["api", "web"]);
    expect((await runCli("snapshot", "--op", "sync", "--cwd", root)).exitCode).toBe(0);
    write(["api", "web", "db", "worker"]);

    const { exitCode, output } = await runCli("history", "--json", "--cwd", root);
    expect(exitCode).toBe(0);
    const entries = JSON.parse(output.text()) as Array<Record<string, unknown>>;
    expect(entries).toEqual([
      expect.objectContaining({ operation: "sync", changes: "+2 nodes, +2 edges" }),
      expect.objectContaining({ operation: "generate", changes: "+1 node, +1 edge" }),
    ]);
    expect(entries[0]).toMatchObject({ archbookVersion: VERSION, existed: true });
  });

  it("says when there are no snapshots", async () => {
    const { output } = await runCli("history", "--cwd", project());
    expect(output.text()).toBe(
      "No snapshots yet. They are saved automatically before generate, sync, add-flow, explain and format.",
    );
    expect(
      JSON.parse((await runCli("history", "--json", "--cwd", project())).output.text()),
    ).toEqual([]);
  });
});

describe("snapshot", () => {
  const git = (root: string, ...args: string[]) => {
    const result = spawnSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
      { cwd: root, encoding: "utf8" },
    );
    if (result.status !== 0) throw new Error(result.stderr);
  };

  function committedProject(): string {
    const root = project();
    git(root, "init", "--quiet");
    git(root, "add", ".");
    git(root, "commit", "--quiet", "-m", "init");
    return root;
  }

  const warning = /Warning: archbook\/architecture\.json has uncommitted changes/;

  it("prints the snapshot id, the time and the document metadata", async () => {
    const { exitCode, output } = await runCli("snapshot", "--op", "generate", "--cwd", project());
    expect(exitCode).toBe(0);
    const [saved, time, ...metadata] = output.text().split("\n");
    expect(saved).toMatch(/^Snapshot \d{8}-\d{6}-\d{3}-generate saved\.$/);
    expect(time).toMatch(/^Time: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(metadata).toEqual([
      `Schema: ${ARCHITECTURE_SCHEMA_URL}`,
      `Generated-By: archbook@${VERSION} + claude-code`,
    ]);
  });

  it("warns on stderr when architecture.json has uncommitted changes", async () => {
    const root = committedProject();
    const clean = await runCli("snapshot", "--op", "generate", "--cwd", root);
    expect(clean.output.text()).not.toMatch(warning);

    writeFileSync(path.join(root, "archbook/architecture.json"), minimalDocument(["api", "web"]));
    const dirty = await runCli("snapshot", "--op", "generate", "--cwd", root);
    expect(dirty.exitCode).toBe(0);
    expect(dirty.output.events[0]).toMatchObject({ kind: "errorLine", text: warning });
    expect(dirty.output.text()).toMatch(/Snapshot .* saved\./);
  });

  it("does not warn for operations that only add to the document", async () => {
    const root = committedProject();
    writeFileSync(path.join(root, "archbook/architecture.json"), minimalDocument(["api", "web"]));
    const { output } = await runCli("snapshot", "--op", "add-flow", "--cwd", root);
    expect(output.text()).not.toMatch(warning);
  });

  it("does not save the same content twice", async () => {
    const root = project();
    await runCli("snapshot", "--op", "generate", "--cwd", root);
    const { output } = await runCli("snapshot", "--op", "sync", "--cwd", root);
    expect(output.text()).toMatch(/already holds the current architecture\.json; nothing new/);
  });
});

describe("format", () => {
  const UNFORMATTED = `${JSON.stringify({
    edges: [{ kind: "http", to: "api", from: "user", id: "user-to-api" }],
    nodes: [
      { summary: "Uses the app.", name: "User", kind: "actor", id: "user", tech: [] },
      {
        id: "api",
        kind: "service",
        name: "api",
        summary: "api service.",
        sources: [{ path: "src/server.ts" }],
      },
    ],
    project: { description: "Demo project", name: "Demo" },
    version: "0.1",
  })}\n`;
  const read = (root: string) =>
    readFileSync(path.join(root, "archbook/architecture.json"), "utf8");

  it("--check exits with 1 when the file would change, and changes nothing", async () => {
    const root = project(UNFORMATTED);
    const { exitCode, output } = await runCli("format", "--check", "--cwd", root);
    expect(exitCode).toBe(1);
    expect(output.text()).toBe(
      "✖ archbook/architecture.json is not formatted. Run archbook format.",
    );
    expect(read(root)).toBe(UNFORMATTED);
    expect(existsSync(path.join(root, "archbook/.history"))).toBe(false);
  });

  it("rewrites the file after a format snapshot, and then --check passes", async () => {
    const root = project(UNFORMATTED);
    const { exitCode, output } = await runCli("format", "--cwd", root);
    expect(exitCode).toBe(0);
    expect(output.text()).toMatch(/^✔ Formatted archbook\/architecture\.json\./);
    expect(read(root)).toBe(minimalDocument());
    const [snapshot] = readdirSync(path.join(root, "archbook/.history"));
    expect(snapshot).toMatch(/-format\.json$/);

    const check = await runCli("format", "--check", "--cwd", root);
    expect(check.exitCode).toBe(0);
    expect(check.output.text()).toBe("✔ archbook/architecture.json is formatted.");
  });

  it("does not format a document that fails the schema", async () => {
    const root = project('{ "version": "0.1" }\n');
    const { exitCode, output } = await runCli("format", "--cwd", root);
    expect(exitCode).toBe(1);
    expect(output.text()).toMatch(/^✖ archbook\/architecture\.json: \d+ errors?/);
    expect(read(root)).toBe('{ "version": "0.1" }\n');
  });

  it("formats a document with semantic errors", async () => {
    const root = project(INVALID_DOCUMENT);
    expect((await runCli("format", "--check", "--cwd", root)).exitCode).toBe(0);
  });

  it("formats another file with --file, without a snapshot", async () => {
    const root = project();
    writeFileSync(path.join(root, "other.json"), UNFORMATTED);
    expect((await runCli("format", "--file", "other.json", "--cwd", root)).exitCode).toBe(0);
    expect(readFileSync(path.join(root, "other.json"), "utf8")).toBe(minimalDocument());
    expect(existsSync(path.join(root, "archbook/.history"))).toBe(false);
  });

  it("keeps the example formatted", async () => {
    const { exitCode } = await runCli("format", "--check", "--cwd", examplePath);
    expect(exitCode).toBe(0);
  });
});

describe("merge", () => {
  const draftFile = (root: string, draft: unknown) => {
    mkdirSync(path.join(root, "archbook/.drafts"), { recursive: true });
    writeFileSync(path.join(root, "archbook/.drafts/checkout.json"), JSON.stringify(draft));
    return "archbook/.drafts/checkout.json";
  };

  it("merges a flow draft and prints only the JSON report", async () => {
    const root = project();
    const draft = draftFile(root, {
      flow: {
        id: "visit",
        name: "Visit",
        summary: "User opens the app.",
        trigger: "User opens the page",
        steps: [{ edge: "user-calls-api", title: "Requests the page" }],
      },
      newEdges: [{ id: "user-calls-api", from: "user", to: "api", kind: "http" }],
      notes: [],
    });
    const { exitCode, output } = await runCli("merge", "--draft", draft, "--cwd", root);
    expect(exitCode).toBe(0);
    expect(output.events.map((event) => event.kind)).toEqual(["json"]);
    expect(JSON.parse(output.text())).toMatchObject({
      written: true,
      draft,
      added: { flows: ["visit"], edges: [] },
      reused: [{ type: "edge", id: "user-calls-api", existing: "user-to-api" }],
      validation: { valid: true, stats: { flows: 1 } },
    });
    const doc = JSON.parse(readFileSync(path.join(root, "archbook/architecture.json"), "utf8"));
    expect(doc.flows[0].steps[0].edge).toBe("user-to-api");
    expect(existsSync(path.join(root, draft))).toBe(false);
  });

  it("replaces the structure with --replace-structure", async () => {
    const root = project();
    const draft = draftFile(root, {
      nodes: [{ id: "user", kind: "actor", name: "User", summary: "Uses the app." }],
      edges: [],
    });
    const { exitCode, output } = await runCli(
      "merge",
      "--draft",
      draft,
      "--replace-structure",
      "--cwd",
      root,
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(output.text())).toMatchObject({
      removed: { nodes: ["api"], edges: ["user-to-api"] },
      validation: { stats: { nodes: 1, edges: 0 } },
    });
  });

  it("exits with 1 and keeps the draft when the result fails the schema", async () => {
    const root = project();
    const draft = draftFile(root, { nodes: [{ id: "x", kind: "nope", name: "X", summary: "X" }] });
    const { exitCode, output } = await runCli("merge", "--draft", draft, "--cwd", root);
    expect(exitCode).toBe(1);
    expect(JSON.parse(output.text())).toMatchObject({
      written: false,
      validation: { valid: false },
    });
    expect(existsSync(path.join(root, draft))).toBe(true);
  });
});
