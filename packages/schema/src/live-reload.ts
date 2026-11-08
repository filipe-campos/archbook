import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { LIVE_RELOAD_EVENT, formatServerEvent } from "./protocol.js";

/** Long enough to merge the writes of one save (editors and atomic renames emit several). */
export const LIVE_RELOAD_DEBOUNCE_MS = 80;
const KEEP_ALIVE_MS = 25_000;

/** The part of `http.ServerResponse` the hub uses. */
export interface LiveReloadClient {
  writeHead(status: number, headers: Record<string, string>): unknown;
  write(chunk: string): unknown;
  end(): unknown;
  on(event: "close", listener: () => void): unknown;
}

export interface LiveReloadOptions {
  /** The architecture.json to watch. */
  file: string;
  debounceMs?: number;
}

export interface LiveReloadHub {
  /** Turns a response into an event stream that receives a `change` event per rewrite. */
  subscribe(client: LiveReloadClient): void;
  /** Runs after the clients are notified. Returns a function that removes the listener. */
  onChange(listener: () => void): () => void;
  close(): void;
}

export function createLiveReloadHub({
  file,
  debounceMs = LIVE_RELOAD_DEBOUNCE_MS,
}: LiveReloadOptions): LiveReloadHub {
  const clients = new Set<LiveReloadClient>();
  const listeners = new Set<() => void>();
  const fileName = path.basename(file);
  let timer: NodeJS.Timeout | undefined;

  const broadcast = (message: string) => {
    for (const client of clients) client.write(message);
  };

  let watcher: FSWatcher | undefined;
  try {
    // Watch the directory: editors and atomic writes replace the file, which breaks file watches.
    watcher = watch(path.dirname(file), (_event, changed) => {
      if (changed && changed !== fileName) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        broadcast(formatServerEvent(LIVE_RELOAD_EVENT));
        for (const listener of listeners) listener();
      }, debounceMs);
    });
  } catch {
    watcher = undefined;
  }

  // Comments keep idle connections open through proxies.
  const keepAlive = setInterval(() => broadcast(": ping\n\n"), KEEP_ALIVE_MS);
  keepAlive.unref();

  return {
    subscribe(client) {
      client.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      client.write(": connected\n\n");
      clients.add(client);
      client.on("close", () => clients.delete(client));
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      clearInterval(keepAlive);
      clearTimeout(timer);
      watcher?.close();
      for (const client of clients) client.end();
      clients.clear();
      listeners.clear();
    },
  };
}
