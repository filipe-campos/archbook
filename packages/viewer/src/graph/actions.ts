import { createContext, useContext } from "react";

export interface CanvasActions {
  select: (id: string) => void;
}

export const CanvasActionsContext = createContext<CanvasActions>({ select: () => {} });
export const useCanvasActions = () => useContext(CanvasActionsContext);
