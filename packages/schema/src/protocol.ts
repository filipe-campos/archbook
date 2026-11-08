/** File the viewer fetches, relative to its own URL. */
export const ARCHITECTURE_FILE = "architecture.json";

/** Server-sent events endpoint that emits `change` whenever architecture.json is rewritten. */
export const LIVE_RELOAD_PATH = "__archbook/events";

/** Meta tag a dev server injects into index.html to tell the viewer that live reload exists. */
export const LIVE_RELOAD_META = "archbook-live-reload";

/** Server-sent event name for a rewritten architecture.json. */
export const LIVE_RELOAD_EVENT = "change";

/** One server-sent event, in the wire format `EventSource` reads. */
export function formatServerEvent(event: string, data: unknown = {}): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
