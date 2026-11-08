import { readFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { ARCHITECTURE_FILE, LIVE_RELOAD_META, LIVE_RELOAD_PATH } from "@archbook/schema";
import { createLiveReloadHub } from "@archbook/schema/node";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

export interface DevServerOptions {
  viewerDir: string;
  architectureFile: string;
  port: number;
  host?: string;
  /** How many ports above `port` to try when it is taken. */
  portAttempts?: number;
  onChange?: () => void;
}

export interface DevServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/** Adds the meta tag that tells the viewer to subscribe to live reload. */
export function injectLiveReload(html: string): string {
  const tag = `<meta name="${LIVE_RELOAD_META}" content="./${LIVE_RELOAD_PATH}">`;
  return html.includes("</head>") ? html.replace("</head>", `  ${tag}\n  </head>`) : tag + html;
}

export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const host = options.host ?? "localhost";
  const viewerRoot = path.resolve(options.viewerDir);
  const hub = createLiveReloadHub({ file: options.architectureFile });
  if (options.onChange) hub.onChange(options.onChange);

  const server = createServer((req, res) => {
    void handle(req.url ?? "/", res).catch(() => {
      res.statusCode = 500;
      res.end("Internal error");
    });
  });

  async function handle(rawUrl: string, res: ServerResponse) {
    const pathname = decodeURIComponent(new URL(rawUrl, "http://localhost").pathname);

    if (pathname === `/${ARCHITECTURE_FILE}`) {
      try {
        const body = await readFile(options.architectureFile);
        res.writeHead(200, {
          "content-type": CONTENT_TYPES[".json"]!,
          "cache-control": "no-store",
        });
        res.end(body);
      } catch {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("architecture.json not found");
      }
      return;
    }

    if (pathname === `/${LIVE_RELOAD_PATH}`) {
      hub.subscribe(res);
      return;
    }

    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(viewerRoot, relative);
    if (file !== viewerRoot && !file.startsWith(viewerRoot + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    let body: Buffer;
    try {
      body = await readFile(file);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const type = CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    res.end(relative === "index.html" ? injectLiveReload(body.toString("utf8")) : body);
  }

  let port: number;
  try {
    port = await listen(server, options.port, host, options.portAttempts ?? 10);
  } catch (error) {
    hub.close();
    throw error;
  }

  return {
    url: `http://${host}:${port}/`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        hub.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

function listen(server: Server, port: number, host: string, attempts: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (candidate: number, left: number) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off("listening", onListening);
        if (error.code === "EADDRINUSE" && left > 1) tryPort(candidate + 1, left - 1);
        else reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        resolve(typeof address === "object" && address ? address.port : candidate);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate, host);
    };
    tryPort(port, attempts);
  });
}
