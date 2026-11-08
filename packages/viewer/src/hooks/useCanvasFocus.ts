import { useMemo } from "react";
import { stepEndpoints, type ArchFlow, type ArchitectureIndex } from "@archbook/schema";
import type { CameraFocus } from "../components/canvas/useCameraFocus";
import {
  NO_HIGHLIGHT,
  flowHighlight,
  selectionHighlight,
  type Highlight,
} from "../graph/highlight";

interface CanvasFocusOptions {
  index: ArchitectureIndex;
  flow: ArchFlow | undefined;
  stepIndex: number;
  stepKey: string | undefined;
  /** Travel time of the current step; undefined when no step is on screen. */
  travelMs: number | undefined;
  inspectedId: string | undefined;
  selectedId: string | undefined;
}

/** What the canvas emphasizes, and where the camera goes for the current step. */
export function useCanvasFocus(options: CanvasFocusOptions): {
  highlight: Highlight;
  stepFocus: CameraFocus | undefined;
} {
  const { index, flow, stepIndex, stepKey, travelMs, inspectedId, selectedId } = options;

  const highlight = useMemo(() => {
    if (flow && travelMs !== undefined) {
      return { ...flowHighlight(index, flow, stepIndex, travelMs), selectedId: inspectedId };
    }
    return selectedId ? selectionHighlight(index, selectedId) : NO_HIGHLIGHT;
  }, [index, flow, stepIndex, travelMs, inspectedId, selectedId]);

  const ends = flow ? stepEndpoints(index, flow, stepIndex) : undefined;
  const [from, to] = [ends?.from, ends?.to];
  // Built from primitives so a reload that keeps the step does not move the camera.
  const stepFocus = useMemo(
    () => (stepKey && from && to ? { key: stepKey, ids: [from, to] } : undefined),
    [stepKey, from, to],
  );

  return { highlight, stepFocus };
}
