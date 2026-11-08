import type { Plugin } from "vite";

/**
 * Policy of the built site; the reasons for each directive are in docs/decisions.md (Viewer).
 * `archbook dev` serves the same build, and its live reload stream is same-origin.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Adds the policy to the built index.html only: Vite's dev server injects inline scripts. */
export function contentSecurityPolicy(policy = CONTENT_SECURITY_POLICY): Plugin {
  return {
    name: "archbook-content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: policy },
        injectTo: "head-prepend",
      },
    ],
  };
}
