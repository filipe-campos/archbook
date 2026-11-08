import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UserError } from "../src/errors.js";
import { sha256 } from "../src/lib/fs.js";
import {
  createSnapshot,
  listSnapshots,
  pruneSnapshots,
  readSnapshot,
  resolveSnapshot,
  undo,
} from "../src/lib/history.js";
import { projectPaths } from "../src/lib/project.js";
import { MINIMAL_SOURCES, minimalDocument, tempProject } from "./helpers.js";

const VERSION = "0.0.0-test";
const at = (seconds: number) => new Date(Date.UTC(2026, 10, 8, 10, 0, seconds));

function setup(content?: string) {
  const root = tempProject({
    ...MINIMAL_SOURCES,
    ...(content ? { "archbook/architecture.json": content } : {}),
  });
  return projectPaths(root);
}

const fileHash = (file: string) => sha256(readFileSync(file));

describe("snapshots", () => {
  it("records content, hash and metadata", () => {
    const paths = setup(minimalDocument());
    const { snapshot, created } = createSnapshot(paths, {
      operation: "generate",
      version: VERSION,
      limit: 20,
      now: at(1),
    });
    expect(created).toBe(true);
    expect(snapshot).toMatchObject({
      id: "20261108-100001-000-generate",
      operation: "generate",
      archbookVersion: VERSION,
      existed: true,
      hash: fileHash(paths.architecture),
    });
    expect(readSnapshot(paths, snapshot.id).content).toBe(minimalDocument());
  });

  it("skips a new snapshot when the newest one already holds the same content", () => {
    const paths = setup(minimalDocument());
    createSnapshot(paths, { operation: "generate", version: VERSION, limit: 20, now: at(1) });
    const second = createSnapshot(paths, {
      operation: "generate",
      version: VERSION,
      limit: 20,
      now: at(2),
    });
    expect(second.created).toBe(false);
    expect(listSnapshots(paths)).toHaveLength(1);
  });

  it("keeps only the newest snapshots", () => {
    const paths = setup();
    mkdirSync(paths.dir);
    for (let i = 0; i < 5; i++) {
      writeFileSync(paths.architecture, minimalDocument([`svc-${i}`]));
      createSnapshot(paths, { operation: "sync", version: VERSION, limit: 3, now: at(i) });
    }
    expect(listSnapshots(paths).map((s) => s.createdAt)).toEqual(
      [at(4), at(3), at(2)].map((d) => d.toISOString()),
    );
    expect(pruneSnapshots(paths, 1)).toHaveLength(2);
  });

  it("rejects operation names that are not safe file names", () => {
    expect(() =>
      createSnapshot(setup(), { operation: "../evil", version: VERSION, limit: 20 }),
    ).toThrow(/Invalid operation/);
  });

  it("resolves ids by unique prefix", () => {
    const paths = setup(minimalDocument());
    const { snapshot } = createSnapshot(paths, {
      operation: "generate",
      version: VERSION,
      limit: 20,
      now: at(1),
    });
    expect(resolveSnapshot(paths, "20261108-1000").id).toBe(snapshot.id);
    expect(() => resolveSnapshot(paths, "1999")).toThrow(/No snapshot/);
    expect(() => resolveSnapshot(paths, "1999")).toThrow(UserError);
  });

  it("rejects snapshot files with the wrong shape, and lists only valid ones", () => {
    const paths = setup(minimalDocument());
    const { snapshot } = createSnapshot(paths, {
      operation: "generate",
      version: VERSION,
      limit: 20,
      now: at(1),
    });
    mkdirSync(paths.history, { recursive: true });
    const broken = {
      archbookSnapshot: 1,
      id: "20261108-100002-000-sync",
      operation: "sync",
      createdAt: at(2).toISOString(),
      archbookVersion: VERSION,
      existed: "yes",
      hash: null,
      content: 42,
    };
    writeFileSync(`${paths.history}/${broken.id}.json`, JSON.stringify(broken));
    writeFileSync(`${paths.history}/not-json.json`, "{ nope");

    expect(() => readSnapshot(paths, broken.id)).toThrow(UserError);
    expect(() => readSnapshot(paths, "not-json")).toThrow(/missing or unreadable/);
    expect(() => readSnapshot(paths, "absent")).toThrow(UserError);
    expect(listSnapshots(paths).map((meta) => meta.id)).toEqual([snapshot.id]);
  });
});

describe("undo", () => {
  it("restores exactly the file from before an operation, and redoes when run again", () => {
    const before = minimalDocument(["api"]);
    const paths = setup(before);
    const originalHash = fileHash(paths.architecture);

    createSnapshot(paths, { operation: "add-flow", version: VERSION, limit: 20, now: at(1) });
    const after = minimalDocument(["api", "worker"]);
    writeFileSync(paths.architecture, after);

    const result = undo(paths, { version: VERSION, limit: 20 })!;
    expect(result.restored.operation).toBe("add-flow");
    expect(fileHash(paths.architecture)).toBe(originalHash);

    undo(paths, { version: VERSION, limit: 20 });
    expect(readFileSync(paths.architecture, "utf8")).toBe(after);
  });

  it("removes the file when the first generation is undone", () => {
    const paths = setup();
    mkdirSync(paths.dir);
    createSnapshot(paths, { operation: "generate", version: VERSION, limit: 20, now: at(1) });
    writeFileSync(paths.architecture, minimalDocument());

    const result = undo(paths, { version: VERSION, limit: 20 })!;
    expect(result.after).toBeNull();
    expect(existsSync(paths.architecture)).toBe(false);

    undo(paths, { version: VERSION, limit: 20 });
    expect(readFileSync(paths.architecture, "utf8")).toBe(minimalDocument());
  });

  it("restores a specific snapshot with --to", () => {
    const paths = setup(minimalDocument(["v1"]));
    const { snapshot: first } = createSnapshot(paths, {
      operation: "generate",
      version: VERSION,
      limit: 20,
      now: at(1),
    });
    writeFileSync(paths.architecture, minimalDocument(["v2"]));
    createSnapshot(paths, { operation: "sync", version: VERSION, limit: 20, now: at(2) });
    writeFileSync(paths.architecture, minimalDocument(["v3"]));

    undo(paths, { to: first.id, version: VERSION, limit: 20 });
    expect(readFileSync(paths.architecture, "utf8")).toBe(minimalDocument(["v1"]));
  });

  it("reports nothing to undo when no snapshot differs", () => {
    const paths = setup(minimalDocument());
    expect(undo(paths, { version: VERSION, limit: 20 })).toBeUndefined();
    createSnapshot(paths, { operation: "generate", version: VERSION, limit: 20 });
    expect(undo(paths, { version: VERSION, limit: 20 })).toBeUndefined();
  });
});
