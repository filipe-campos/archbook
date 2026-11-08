import { useEffect } from "react";
import { useNodesInitialized, useReactFlow, type FitViewOptions } from "@xyflow/react";

/** A request to move the camera; a new `key` triggers a new move. */
export interface CameraFocus {
  key: string;
  ids: string[];
}

export type CameraMove = Pick<FitViewOptions, "duration" | "padding" | "maxZoom">;

/** Fits the view to `focus` whenever it changes. Keep `focus` and `move` referentially stable. */
export function useCameraFocus(focus: CameraFocus | undefined, move: CameraMove): void {
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!initialized || !focus) return;
    void fitView({ ...move, nodes: focus.ids.map((id) => ({ id })) });
  }, [initialized, focus, move, fitView]);
}
