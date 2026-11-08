import type { ArchitectureInput, SourceEntry, SourceFileIndex } from "../src/index.js";

export function baseDocument(): ArchitectureInput {
  return {
    version: "0.1",
    project: { name: "Shop", description: "Online shop" },
    groups: [{ id: "backend", name: "Backend" }],
    nodes: [
      { id: "customer", kind: "actor", name: "Customer", summary: "Buys things." },
      {
        id: "web",
        kind: "app",
        name: "Web",
        summary: "Storefront.",
        sources: [{ path: "apps/web/page.tsx", lines: [1, 3] }],
      },
      {
        id: "api",
        kind: "service",
        name: "API",
        summary: "Orders API.",
        group: "backend",
        sources: [{ path: "services/api" }],
      },
      { id: "stripe", kind: "external", name: "Stripe", summary: "Payments." },
    ],
    edges: [
      { id: "customer-to-web", from: "customer", to: "web", kind: "http" },
      { id: "web-to-api", from: "web", to: "api", kind: "http", label: "POST /orders" },
      { id: "api-to-stripe", from: "api", to: "stripe", kind: "http" },
    ],
    flows: [
      {
        id: "checkout",
        name: "Checkout",
        summary: "Customer pays.",
        trigger: "Customer clicks Pay",
        steps: [
          { edge: "customer-to-web", title: "Clicks pay" },
          { edge: "web-to-api", title: "Creates order" },
          { edge: "api-to-stripe", title: "Charges card" },
          { edge: "web-to-api", title: "Responds", reverse: true },
        ],
      },
    ],
  };
}

export function memoryIndex(entries: Record<string, SourceEntry>): SourceFileIndex {
  return { lookup: (path) => entries[path] };
}

export const fullIndex = memoryIndex({
  "apps/web/page.tsx": { type: "file", lineCount: 10 },
  "services/api": { type: "directory" },
});
