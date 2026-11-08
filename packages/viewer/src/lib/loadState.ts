import type { Architecture, ValidationIssue } from "@archbook/schema";

/** Why the newest reload could not replace the document on screen. */
export type ReloadError =
  { kind: "invalid"; errors: ValidationIssue[] } | { kind: "missing"; message: string };

/** The outcome of one fetch of architecture.json. */
export type LoadResult =
  | { status: "missing"; message: string }
  | { status: "invalid"; errors: ValidationIssue[] }
  | { status: "ready"; architecture: Architecture; warnings: ValidationIssue[] };

export type LoadState =
  | { status: "loading" }
  | Exclude<LoadResult, { status: "ready" }>
  | {
      status: "ready";
      architecture: Architecture;
      warnings: ValidationIssue[];
      /** Set while the shown document is the last valid one and a newer reload failed. */
      reloadError?: ReloadError;
    };

/** Applies a load result, keeping the last valid document on screen when a reload fails. */
export function nextLoadState(previous: LoadState, result: LoadResult): LoadState {
  if (result.status === "ready" || previous.status !== "ready") return result;
  const reloadError: ReloadError =
    result.status === "invalid"
      ? { kind: "invalid", errors: result.errors }
      : { kind: "missing", message: result.message };
  return { ...previous, reloadError };
}

/** Numbers requests so a slow, older response never overwrites a newer one. */
export function createRequestSequence() {
  let latest = 0;
  return {
    next: () => ++latest,
    isLatest: (request: number) => request === latest,
  };
}
