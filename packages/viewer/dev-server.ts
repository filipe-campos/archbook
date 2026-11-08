import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";
import type { Plugin } from "vite";
// Relative import: Vite bundles the config itself, so this works before @archbook/schema is built.
import { ARCHITECTURE_FILE, LIVE_RELOAD_META, LIVE_RELOAD_PATH } from "../schema/src/protocol.ts";

/**
 * Serves an architecture.json from disk while developing the viewer, with the same live reload
 * protocol as `archbook dev`.
 */
export function archbookDevData(file: string): Plugin {
  const clients = new Set<ServerResponse>();

  return {
    name: "archbook-dev-data",
    apply: "serve",
    configureServer(server) {
      let timer: NodeJS.Timeout | undefined;
      const watcher = watch(path.dirname(file), (_event, name) => {
        if (name !== path.basename(file)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          for (const client of clients) client.write("event: change\ndata: {}\n\n");
        }, 50);
      });
      server.httpServer?.on("close", () => watcher.close());

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

      server.middlewares.use(`/${LIVE_RELOAD_PATH}`, (req, res) => {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
        });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
      });
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
