export const GITIGNORE_HEADER = "# Archbook";
export const GITIGNORE_LINES = ["archbook/.history/", "archbook/dist/"];

/**
 * Text to append so `existing` contains every line, or undefined when nothing is missing. The
 * result is recorded verbatim so it can be removed byte for byte later.
 */
export function textToAppend(
  existing: string | undefined,
  lines: readonly string[],
  header?: string,
): string | undefined {
  const present = new Set((existing ?? "").split(/\r?\n/).map((line) => line.trim()));
  const missing = lines.filter((line) => !present.has(line));
  if (missing.length === 0) return undefined;
  const block = `${[header, ...missing].filter(Boolean).join("\n")}\n`;
  if (!existing) return block;
  return `${existing.endsWith("\n") ? "" : "\n"}\n${block}`;
}

/** Removes previously appended text. Falls back to removing its lines one by one if it was edited. */
export function removeAppendedText(
  content: string,
  appended: string,
): { content: string; exact: boolean } {
  if (content.endsWith(appended))
    return { content: content.slice(0, -appended.length), exact: true };
  const index = content.indexOf(appended);
  if (index >= 0) {
    const before = content.slice(0, index);
    const after = content.slice(index + appended.length);
    // The appended text may have ended the user's last line; lines added later still need one.
    const joint = before !== "" && !before.endsWith("\n") && after !== "" ? "\n" : "";
    return { content: before + joint + after, exact: true };
  }
  const lines = content.split("\n");
  for (const target of appended.split("\n").filter((line) => line.trim() !== "")) {
    const at = lines.indexOf(target);
    if (at >= 0) lines.splice(at, 1);
  }
  return { content: lines.join("\n"), exact: false };
}
