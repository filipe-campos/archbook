import { useCallback, useState } from "react";
import type { ArchitectureIndex } from "@archbook/schema";
import type { Navigate } from "../data/useHashRoute";
import { OVERVIEW, type Route } from "../lib/route";

export interface Selection {
  /** Node or edge selected through the URL, when it exists. */
  selectedId: string | undefined;
  /** Node or edge opened during a replay, without leaving the flow. */
  inspectedId: string | undefined;
  /** What the details panel shows instead of the step or the overview. */
  panelTarget: string | undefined;
  select: (id: string) => void;
  clear: () => void;
  closeInspected: () => void;
}

interface SelectionOptions {
  index: ArchitectureIndex;
  route: Route;
  navigate: Navigate;
  /** Identifies the replay step on screen, if a flow is open. */
  stepKey: string | undefined;
}

export function useSelection({ index, route, navigate, stepKey }: SelectionOptions): Selection {
  // Keyed by step so an inspected node closes by itself when the replay moves on.
  const [inspected, setInspected] = useState<{ id: string; stepKey: string }>();
  const inspectedId = inspected && inspected.stepKey === stepKey ? inspected.id : undefined;

  const routeId = route.view === "node" || route.view === "edge" ? route.id : undefined;
  const selectedId =
    routeId !== undefined && (index.nodes.has(routeId) || index.edges.has(routeId))
      ? routeId
      : undefined;

  const select = useCallback(
    (id: string) => {
      if (stepKey) return setInspected({ id, stepKey });
      navigate({ view: index.edges.has(id) ? "edge" : "node", id });
    },
    [index, stepKey, navigate],
  );

  const clear = useCallback(() => {
    if (stepKey) setInspected(undefined);
    else if (route.view !== "overview") navigate(OVERVIEW);
  }, [stepKey, route.view, navigate]);

  const closeInspected = useCallback(() => setInspected(undefined), []);

  return {
    selectedId,
    inspectedId,
    panelTarget: inspectedId ?? selectedId,
    select,
    clear,
    closeInspected,
  };
}
