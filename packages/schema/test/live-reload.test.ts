import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLiveReloadHub, type LiveReloadHub } from "../src/node.js";
import { LIVE_RELOAD_EVENT, formatServerEvent } from "../src/protocol.js";

const DEBOUNCE_MS = 40;
const SETTLE_MS = 300;

let hub: LiveReloadHub | undefined;
afterEach(() => {
  hub?.close();
  hub = undefined;
});

function fakeClient() {
  const chunks: string[] = [];
  let onClose: (() => void) | undefined;
  return {
    chunks,
    ended: false,
    status: 0,
    writeHead(status: number) {
      this.status = status;
    },
    write(chunk: string) {
      chunks.push(chunk);
    },
    end() {
      this.ended = true;
    },
    on(_event: "close", listener: () => void) {
      onClose = listener;
    },
    disconnect: () => onClose?.(),
    reset: () => chunks.splice(0),
    events: () => chunks.filter((chunk) => chunk.startsWith("event:")),
  };
}

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "archbook-live-reload-"));
  const file = path.join(dir, "architecture.json");
  writeFileSync(file, "{}");
  return { dir, file };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Some platforms report the file's creation in `setup` after the watcher starts. */
async function settle(...clients: ReturnType<typeof fakeClient>[]) {
  await wait(SETTLE_MS);
  for (const client of clients) client.reset();
}

describe("live reload hub", () => {
  it("merges quick writes into one change event and notifies listeners after the clients", async () => {
    const { file } = setup();
    hub = createLiveReloadHub({ file, debounceMs: DEBOUNCE_MS });
    const client = fakeClient();
    const order: string[] = [];
    hub.subscribe(client);
    hub.onChange(() => order.push(`listener after ${client.events().length} event(s)`));

    expect(client.status).toBe(200);
    expect(client.chunks).toEqual([": connected\n\n"]);
    await settle(client);
    order.length = 0;
    writeFileSync(file, '{"a":1}');
    writeFileSync(file, '{"a":2}');
    await wait(SETTLE_MS);

    expect(client.events()).toEqual([formatServerEvent(LIVE_RELOAD_EVENT)]);
    expect(order).toEqual(["listener after 1 event(s)"]);
  });

  it("ignores other files in the directory and clients that disconnected", async () => {
    const { dir, file } = setup();
    hub = createLiveReloadHub({ file, debounceMs: DEBOUNCE_MS });
    const gone = fakeClient();
    hub.subscribe(gone);
    gone.disconnect();
    const client = fakeClient();
    hub.subscribe(client);

    await settle(client);
    writeFileSync(path.join(dir, "notes.txt"), "x");
    await wait(SETTLE_MS);
    expect(client.events()).toEqual([]);

    writeFileSync(file, '{"b":1}');
    await wait(SETTLE_MS);
    expect(client.events()).toHaveLength(1);
    expect(gone.events()).toEqual([]);
  });

  it("ends the clients on close and stays quiet afterwards", async () => {
    const { file } = setup();
    hub = createLiveReloadHub({ file, debounceMs: DEBOUNCE_MS });
    const client = fakeClient();
    hub.subscribe(client);
    hub.close();
    expect(client.ended).toBe(true);

    writeFileSync(file, '{"c":1}');
    await wait(SETTLE_MS);
    expect(client.events()).toEqual([]);
  });

  it("works without a watcher when the directory does not exist", () => {
    hub = createLiveReloadHub({ file: path.join(tmpdir(), "archbook-missing", "x", "a.json") });
    const client = fakeClient();
    hub.subscribe(client);
    expect(client.chunks).toEqual([": connected\n\n"]);
  });
});

describe("formatServerEvent", () => {
  it("writes the event name and JSON data", () => {
    expect(formatServerEvent("change")).toBe("event: change\ndata: {}\n\n");
  });
});
