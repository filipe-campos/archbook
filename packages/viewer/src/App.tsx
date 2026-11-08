import { ReactFlowProvider } from "@xyflow/react";
import { InvalidScreen, LoadingScreen, MissingScreen } from "./components/ErrorScreen";
import { ReloadBanner } from "./components/ReloadBanner";
import { useArchitecture } from "./data/useArchitecture";
import { useTheme } from "./data/useTheme";
import { Viewer } from "./Viewer";

export function App() {
  const { theme, toggle } = useTheme();
  const state = useArchitecture();

  switch (state.status) {
    case "loading":
      return <LoadingScreen />;
    case "missing":
      return <MissingScreen message={state.message} />;
    case "invalid":
      return <InvalidScreen errors={state.errors} />;
    case "ready":
      return (
        <>
          <ReactFlowProvider>
            <Viewer
              architecture={state.architecture}
              warnings={state.warnings}
              theme={theme}
              onToggleTheme={toggle}
            />
          </ReactFlowProvider>
          {state.reloadError && <ReloadBanner error={state.reloadError} />}
        </>
      );
  }
}
