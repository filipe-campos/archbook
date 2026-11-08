const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Returns a link target only for absolute http(s) URLs. The viewer may receive documents that were
 * never validated, and React 18 renders `javascript:` hrefs.
 */
export function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
