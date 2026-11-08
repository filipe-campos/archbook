import { useEffect, useState } from "react";
import { ARCHITECTURE_FILE, LIVE_RELOAD_META, validateArchitectureText } from "@archbook/schema";
import {
  createRequestSequence,
  nextLoadState,
  type LoadResult,
  type LoadState,
} from "../lib/loadState";

export type { LoadState } from "../lib/loadState";

export async function loadArchitecture(url: string): Promise<LoadResult> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    return { status: "missing", message: error instanceof Error ? error.message : String(error) };
  }
  if (!response.ok) {
    return { status: "missing", message: `${response.status} ${response.statusText}`.trim() };
  }
  // Disk checks (source paths, line ranges) need the file system; `archbook validate` runs them.
  const result = validateArchitectureText(await response.text());
  if (!result.valid || !result.architecture) return { status: "invalid", errors: result.errors };
  return { status: "ready", architecture: result.architecture, warnings: result.warnings };
}

function liveReloadUrl(): string | undefined {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${LIVE_RELOAD_META}"]`);
  return meta?.content || undefined;
}

/** Loads architecture.json and reloads it whenever the dev server reports a change. */
export function useArchitecture(): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const sequence = createRequestSequence();
    let active = true;
    const load = () => {
      const request = sequence.next();
      void loadArchitecture(`./${ARCHITECTURE_FILE}`).then((result) => {
        if (active && sequence.isLatest(request))
          setState((previous) => nextLoadState(previous, result));
      });
    };
    load();
    const url = liveReloadUrl();
    const source = url ? new EventSource(url) : undefined;
    source?.addEventListener("change", load);
    return () => {
      active = false;
      source?.close();
    };
  }, []);

  return state;
}
