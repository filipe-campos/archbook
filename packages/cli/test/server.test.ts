import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDevServer, type DevServer } from "../src/io/server.js";
import { minimalDocument, tempProject } from "./helpers.js";

let server: DevServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

function setup() {
  const root = tempProject({
    "viewer/index.html": "<html><head><title>x</title></head><body></body></html>",
    "viewer/assets/app.js": "console.log(1)",
    "archbook/architecture.json": minimalDocument(),
    "secret.txt": "nope",
  });
  return {
    root,
    viewerDir: path.join(root, "viewer"),
    file: path.join(root, "archbook/architecture.json"),
  };
}

describe("dev server", () => {
  it("serves the viewer with the live reload tag, and architecture.json from the project", async () => {
    const { viewerDir, file } = setup();
    server = await startDevServer({ viewerDir, architectureFile: file, port: 0 });

    const html = await (await fetch(server.url)).text();
    expect(html).toContain('<meta name="archbook-live-reload" content="./__archbook/events">');
    const json = await fetch(`${server.url}architecture.json`);
    expect(json.headers.get("cache-control")).toBe("no-store");
    expect(await json.text()).toBe(minimalDocument());
    expect((await fetch(`${server.url}assets/app.js`)).headers.get("content-type")).toContain(
      "javascript",
    );
  });

  it("does not serve files outside the viewer", async () => {
    const { viewerDir, file } = setup();
    server = await startDevServer({ viewerDir, architectureFile: file, port: 0 });
    const response = await fetch(`${server.url}..%2Fsecret.txt`);
    expect([403, 404]).toContain(response.status);
  });

  it("emits a change event when architecture.json is rewritten", async () => {
    const { viewerDir, file } = setup();
    server = await startDevServer({ viewerDir, architectureFile: file, port: 0 });
    const response = await fetch(`${server.url}__archbook/events`);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    await reader.read();

    // The watcher may report the file's creation first; the write must not outlive the test.
    const write = setTimeout(() => writeFileSync(file, minimalDocument(["api", "worker"])), 100);
    let received = "";
    try {
      while (!received.includes("event: change")) {
        const { value, done } = await reader.read();
        if (done) break;
        received += decoder.decode(value);
      }
    } finally {
      clearTimeout(write);
    }
    expect(received).toContain("event: change");
    await reader.cancel();
  });

  it("moves to the next port when the requested one is taken", async () => {
    const { viewerDir, file } = setup();
    server = await startDevServer({ viewerDir, architectureFile: file, port: 0 });
    const second = await startDevServer({ viewerDir, architectureFile: file, port: server.port });
    expect(second.port).toBe(server.port + 1);
    await second.close();
  });
});
