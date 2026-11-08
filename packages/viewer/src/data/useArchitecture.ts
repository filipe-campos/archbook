import { useCallback, useEffect, useState } from "react";
import {
  ARCHITECTURE_FILE,
  LIVE_RELOAD_META,
  validateArchitectureText,
  type Architecture,
  type ValidationIssue,
} from "@archbook/schema";

export type LoadState =
  | { status: "loading" }
  | { status: "missing"; message: string }
  | { status: "invalid"; errors: ValidationIssue[] }
  | { status: "ready"; architecture: Architecture; warnings: ValidationIssue[]; version: number };

export async function loadArchitecture(url: string, version: number): Promise<LoadState> {
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
  return { status: "ready", architecture: result.architecture, warnings: result.warnings, version };
}

function liveReloadUrl(): string | undefined {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${LIVE_RELOAD_META}"]`);
  return meta?.content || undefined;
}

/** Loads architecture.json and reloads it whenever the dev server reports a change. */
export function useArchitecture(): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback((version: number) => {
    void loadArchitecture(`./${ARCHITECTURE_FILE}`, version).then(setState);
  }, []);

  useEffect(() => {
    let version = 0;
    load(version);
    const url = liveReloadUrl();
    if (!url) return;
    const source = new EventSource(url);
    source.addEventListener("change", () => load(++version));
    return () => source.close();
  }, [load]);

  return state;
}
