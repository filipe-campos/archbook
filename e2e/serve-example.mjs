// Builds the example with the CLI and serves the site, as a static host would.
import { spawnSync } from "node:child_process";
import { createReadStream, mkdtempSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.argv[2] ?? 4410);
const out = path.join(mkdtempSync(path.join(tmpdir(), "archbook-e2e-")), "site");

const build = spawnSync(
  process.execPath,
  [
    path.join(root, "packages/cli/dist/index.js"),
    "build",
    "--cwd",
    "examples/shop-checkout",
    "--out",
    out,
  ],
  { cwd: root, stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  const file = path.join(
    out,
    path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, ""),
  );
  const target = file.endsWith(path.sep) || pathname === "/" ? path.join(file, "index.html") : file;
  if (!target.startsWith(out) || !statSync(target, { throwIfNoEntry: false })?.isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(target)] ?? "application/octet-stream" });
  createReadStream(target).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Serving ${out} at http://127.0.0.1:${port}/`));
