export type JsonTokenType =
  "key" | "string" | "number" | "boolean" | "null" | "punctuation" | "space";

export interface JsonToken {
  type: JsonTokenType;
  text: string;
}

const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b|([{}[\],:])|(\s+)/g;

/** Splits pretty-printed JSON into tokens for syntax highlighting, without using innerHTML. */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last)
      tokens.push({ type: "punctuation", text: text.slice(last, match.index) });
    const [whole, string, colon, number, boolean, nil, punctuation, space] = match;
    if (string !== undefined) {
      tokens.push({ type: colon ? "key" : "string", text: string });
      if (colon) tokens.push({ type: "punctuation", text: colon });
    } else if (number !== undefined) tokens.push({ type: "number", text: number });
    else if (boolean !== undefined) tokens.push({ type: "boolean", text: boolean });
    else if (nil !== undefined) tokens.push({ type: "null", text: nil });
    else if (punctuation !== undefined) tokens.push({ type: "punctuation", text: punctuation });
    else if (space !== undefined) tokens.push({ type: "space", text: space });
    last = match.index + whole.length;
  }
  if (last < text.length) tokens.push({ type: "punctuation", text: text.slice(last) });
  return tokens;
}

export function stringifyPayload(payload: unknown): string {
  if (typeof payload === "string") return JSON.stringify(payload);
  return JSON.stringify(payload, null, 2) ?? String(payload);
}
