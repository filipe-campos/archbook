export type Route =
  | { view: "overview" }
  | { view: "node"; id: string }
  | { view: "edge"; id: string }
  /** `step` is 1-based, as shown to people and in shared links. */
  | { view: "flow"; flowId: string; step: number };

export const OVERVIEW: Route = { view: "overview" };

const SEGMENT = /^[a-z0-9-]+$/;

/** Parses `#/flow/checkout/step/3`, `#/node/orders-api`, `#/edge/a-to-b`. Anything else is the overview. */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [view, id, stepKeyword, stepValue] = parts;
  if (!id || !SEGMENT.test(id)) return OVERVIEW;
  if (view === "node" && parts.length === 2) return { view: "node", id };
  if (view === "edge" && parts.length === 2) return { view: "edge", id };
  if (view === "flow") {
    if (parts.length === 2) return { view: "flow", flowId: id, step: 1 };
    const step = Number(stepValue);
    if (parts.length === 4 && stepKeyword === "step" && Number.isInteger(step) && step >= 1) {
      return { view: "flow", flowId: id, step };
    }
  }
  return OVERVIEW;
}

export function formatHash(route: Route): string {
  switch (route.view) {
    case "overview":
      return "#/";
    case "node":
      return `#/node/${encodeURIComponent(route.id)}`;
    case "edge":
      return `#/edge/${encodeURIComponent(route.id)}`;
    case "flow":
      return `#/flow/${encodeURIComponent(route.flowId)}/step/${route.step}`;
  }
}
