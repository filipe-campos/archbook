import type { SourceRef } from "@archbook/schema";

/**
 * Builds a link to a source file on the code host, e.g.
 * `https://github.com/o/r/blob/main/src/a.ts#L10-L20`. GitLab and Bitbucket use their own URL shapes.
 */
export function sourceUrl(repoUrl: string, branch: string, source: SourceRef): string {
  const base = repoUrl.replace(/\.git$/, "").replace(/\/+$/, "");
  const path = source.path.replace(/^\.\//, "").split("/").map(encodeURIComponent).join("/");
  const ref = encodeURIComponent(branch);
  const [start, end] = source.lines ?? [];
  let host = "";
  try {
    host = new URL(base).hostname;
  } catch {
    // Not a URL; fall through to the GitHub shape.
  }

  if (host.includes("gitlab")) {
    const anchor = start ? `#L${start}${end && end !== start ? `-${end}` : ""}` : "";
    return `${base}/-/blob/${ref}/${path}${anchor}`;
  }
  if (host.includes("bitbucket")) {
    const anchor = start ? `#lines-${start}${end && end !== start ? `:${end}` : ""}` : "";
    return `${base}/src/${ref}/${path}${anchor}`;
  }
  const anchor = start ? `#L${start}${end && end !== start ? `-L${end}` : ""}` : "";
  return `${base}/blob/${ref}/${path}${anchor}`;
}

export function formatSourceLabel(source: SourceRef): string {
  if (!source.lines) return source.path;
  const [start, end] = source.lines;
  return start === end ? `${source.path}:${start}` : `${source.path}:${start}-${end}`;
}
