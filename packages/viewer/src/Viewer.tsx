import { useCallback, useEffect, useMemo, useState } from "react";
import { indexArchitecture, type Architecture, type ValidationIssue } from "@archbook/schema";
import { Canvas, type CameraFocus } from "./components/canvas/Canvas";
import { DetailsPanel } from "./components/panel/DetailsPanel";
import type { PanelActions } from "./components/panel/Panels";
import { Timeline } from "./components/timeline/Timeline";
import { TopBar } from "./components/topbar/TopBar";
import { useHashRoute } from "./data/useHashRoute";
import type { Theme } from "./data/useTheme";
import { useCanvasFocus } from "./hooks/useCanvasFocus";
import { useFlowRoute } from "./hooks/useFlowRoute";
import { usePlayback } from "./hooks/usePlayback";
import { useSelection } from "./hooks/useSelection";
import { useViewerShortcuts } from "./hooks/useViewerShortcuts";
import { OVERVIEW } from "./lib/route";
import styles from "./Viewer.module.css";

interface ViewerProps {
  architecture: Architecture;
  warnings: ValidationIssue[];
  theme: Theme;
  onToggleTheme: () => void;
}

export function Viewer({ architecture, warnings, theme, onToggleTheme }: ViewerProps) {
  const [route, navigate] = useHashRoute();
  const [searchFocus, setSearchFocus] = useState<CameraFocus>();
  const index = useMemo(() => indexArchitecture(architecture), [architecture]);

  const { flow, stepIndex, stepKey, goTo } = useFlowRoute(index, route, navigate);
  const { playing, speed, setSpeed, timing, togglePlay, restart, stop } = usePlayback({
    flow,
    stepIndex,
    goTo,
  });
  const { inspectedId, selectedId, panelTarget, select, clear, closeInspected } = useSelection({
    index,
    route,
    navigate,
    stepKey,
  });

  const openFlow = useCallback(
    (flowId: string | undefined, stepNumber = 1) => {
      stop();
      navigate(flowId ? { view: "flow", flowId, step: stepNumber } : OVERVIEW);
    },
    [stop, navigate],
  );
  const closeFlow = useCallback(() => openFlow(undefined), [openFlow]);

  const { highlight, stepFocus } = useCanvasFocus({
    index,
    flow,
    stepIndex,
    stepKey,
    travelMs: timing?.travelMs,
    inspectedId,
    selectedId,
  });

  const pickNode = useCallback(
    (id: string) => {
      select(id);
      setSearchFocus({ key: `${id}:${Date.now()}`, ids: [id] });
    },
    [select],
  );

  useViewerShortcuts(
    flow
      ? {
          " ": togglePlay,
          ArrowRight: () => goTo(stepIndex + 1),
          ArrowLeft: () => goTo(stepIndex - 1),
          Escape: inspectedId ? closeInspected : closeFlow,
        }
      : { Escape: clear },
  );

  useEffect(() => {
    document.title = `${architecture.project.name} · Archbook`;
  }, [architecture.project.name]);

  const actions = useMemo<PanelActions>(() => ({ select, openFlow }), [select, openFlow]);

  return (
    <div className={styles.app}>
      <TopBar
        projectName={architecture.project.name}
        flows={architecture.flows}
        nodes={architecture.nodes}
        activeFlowId={flow?.id}
        theme={theme}
        onOpenFlow={openFlow}
        onPickNode={pickNode}
        onToggleTheme={onToggleTheme}
      />
      <div className={styles.main}>
        <div className={styles.stage}>
          <Canvas
            architecture={architecture}
            highlight={highlight}
            theme={theme}
            stepFocus={stepFocus}
            searchFocus={searchFocus}
            onSelect={select}
            onClear={clear}
          />
          {flow && timing && (
            <Timeline
              flow={flow}
              index={stepIndex}
              playing={playing}
              speed={speed}
              dwellMs={timing.dwellMs}
              onGoTo={goTo}
              onTogglePlay={togglePlay}
              onRestart={restart}
              onSpeed={setSpeed}
              onClose={closeFlow}
            />
          )}
        </div>
        <DetailsPanel
          architecture={architecture}
          index={index}
          warnings={warnings}
          flow={flow}
          stepIndex={stepIndex}
          target={panelTarget}
          actions={actions}
          onBack={flow ? closeInspected : () => navigate(OVERVIEW)}
        />
      </div>
    </div>
  );
}
