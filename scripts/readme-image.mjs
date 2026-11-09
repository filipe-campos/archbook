// Renders docs/assets/hero.png: the example replaying a flow, framed in a browser window.
// Run after `pnpm build`: `pnpm readme:image`.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const port = 4420;
const route = "#/flow/checkout/step/5";
const out = path.join(root, "docs/assets/hero.png");

const server = spawn(process.execPath, [path.join(root, "e2e/serve-example.mjs"), String(port)], {
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
});

async function waitForServer(url) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The example site did not start on ${url}`);
}

const frame = (shot) => `<!doctype html>
<html><head><style>
  html, body { margin: 0; }
  body {
    width: 1680px; height: 1100px; display: grid; place-items: center;
    background:
      radial-gradient(900px 600px at 10% 0%, rgb(124 92 255 / 38%), transparent 65%),
      radial-gradient(800px 560px at 100% 100%, rgb(34 211 238 / 24%), transparent 62%),
      #06070c;
  }
  .window {
    position: relative; width: 1520px; border-radius: 16px; overflow: hidden;
    border: 1px solid rgb(255 255 255 / 12%);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 60%), 0 40px 120px rgb(0 0 0 / 70%), 0 0 160px rgb(124 92 255 / 28%);
  }
  .chrome {
    height: 42px; display: flex; align-items: center; gap: 8px; padding: 0 16px;
    background: #10121c; border-bottom: 1px solid rgb(255 255 255 / 7%);
  }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .url {
    margin: 0 auto; padding: 5px 18px; border-radius: 8px; background: rgb(255 255 255 / 5%);
    font: 500 13px ui-monospace, Menlo, monospace; color: #8d93ad; letter-spacing: 0.02em;
  }
  img { display: block; width: 100%; }
</style></head><body>
  <div class="window">
    <div class="chrome">
      <span class="dot" style="background:#ff5f57"></span>
      <span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="url">localhost:4400/${route}</span>
      <span style="width:52px"></span>
    </div>
    <img src="data:image/png;base64,${shot.toString("base64")}" />
  </div>
</body></html>`;

try {
  const url = `http://127.0.0.1:${port}/`;
  await waitForServer(url);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1520, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  await page.goto(url + route);
  await page.waitForSelector(".react-flow__node-arch");
  // Let the camera settle on the step and the travelling dot reach the middle of the edge.
  await page.waitForTimeout(2600);
  const shot = await page.screenshot();

  const canvas = await browser.newPage({
    viewport: { width: 1680, height: 1100 },
    deviceScaleFactor: 1.5,
  });
  await canvas.setContent(frame(shot));
  await canvas.waitForFunction("document.images[0]?.complete");
  writeFileSync(out, await canvas.screenshot());
  await browser.close();
  console.log(`Wrote ${path.relative(root, out)}`);
} finally {
  server.kill();
}
