export function countLines(text: string): number {
  if (text === "") return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  return text.endsWith("\n") ? lines - 1 : lines;
}

export type NormalizedPath = { ok: true; path: string } | { ok: false; reason: string };

/**
 * Normalizes a project-relative path (`./a/../b` -> `b`) without touching the disk, so the same
 * rules apply in the browser and in Node.
 */
export function normalizeSourcePath(raw: string): NormalizedPath {
  if (raw.includes("\\")) return { ok: false, reason: "must use forward slashes" };
  if (raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
    return { ok: false, reason: "must be relative to the project root, not absolute" };
  }
  const segments: string[] = [];
  for (const segment of raw.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return { ok: false, reason: "points outside the project root" };
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return { ok: true, path: segments.length === 0 ? "." : segments.join("/") };
}
