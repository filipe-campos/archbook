import { useCallback, useEffect, useState } from "react";
import { formatHash, parseHash, type Route } from "../lib/route";

export type Navigate = (route: Route, options?: { replace?: boolean }) => void;

/** The URL hash is the source of truth for what is shown, so any view can be shared as a link. */
export function useHashRoute(): [Route, Navigate] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback<Navigate>((next, options) => {
    const hash = formatHash(next);
    if (hash !== window.location.hash) {
      // replaceState does not fire hashchange, so the state is updated directly.
      if (options?.replace) window.history.replaceState(null, "", hash);
      else window.history.pushState(null, "", hash);
    }
    setRoute(next);
  }, []);

  return [route, navigate];
}
