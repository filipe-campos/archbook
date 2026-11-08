import { createContext, useContext } from "react";
import { NO_HIGHLIGHT, type Highlight } from "../../graph/highlight";

export interface CanvasActions {
  select: (id: string) => void;
}

export const CanvasActionsContext = createContext<CanvasActions>({ select: () => {} });
export const useCanvasActions = () => useContext(CanvasActionsContext);

export const HighlightContext = createContext<Highlight>(NO_HIGHLIGHT);
export const useHighlight = () => useContext(HighlightContext);
