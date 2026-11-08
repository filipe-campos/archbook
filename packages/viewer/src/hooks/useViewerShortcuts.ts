import { useEffect, useRef } from "react";
import { isTyping } from "../lib/keyboard";

export type ShortcutKey = " " | "ArrowLeft" | "ArrowRight" | "Escape";

/**
 * Handlers by `KeyboardEvent.key`; keys without one are left to the browser, and so are keys a
 * focused element already handled (Space on a canvas node opens it instead of pausing).
 */
export type Shortcuts = Partial<Record<ShortcutKey, () => void>>;

export function useViewerShortcuts(shortcuts: Shortcuts): void {
  // Read through a ref so the listener is added once while handlers change on every render.
  const latest = useRef(shortcuts);
  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTyping(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const handler = latest.current[event.key as ShortcutKey];
      if (!handler) return;
      handler();
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
