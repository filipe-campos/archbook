import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";
// Relative imports: Vite bundles the config itself, so this works before @archbook/schema is built.
import { createLiveReloadHub } from "../schema/src/live-reload.ts";
import { ARCHITECTURE_FILE, LIVE_RELOAD_META, LIVE_RELOAD_PATH } from "../schema/src/protocol.ts";

/**
 * Serves an architecture.json from disk while developing the viewer, with the same live reload
 * protocol as `archbook dev`.
 */
export function archbookDevData(file: string): Plugin {
  return {
    name: "archbook-dev-data",
    apply: "serve",
    configureServer(server) {
      const hub = createLiveReloadHub({ file });
      server.httpServer?.on("close", () => hub.close());

      server.middlewares.use(`/${ARCHITECTURE_FILE}`, async (_req, res) => {
        try {
          const body = await readFile(file);
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end(`Not found: ${file}`);
        }
      });

      server.middlewares.use(`/${LIVE_RELOAD_PATH}`, (_req, res) => hub.subscribe(res));
    },
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { name: LIVE_RELOAD_META, content: `./${LIVE_RELOAD_PATH}` },
        injectTo: "head",
      },
    ],
  };
}
