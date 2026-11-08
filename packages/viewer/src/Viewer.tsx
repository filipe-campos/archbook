import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { Architecture, ValidationIssue } from "@archbook/schema";
import { Canvas, type CameraFocus } from "./components/canvas/Canvas";
import {
  EdgePanel,
  NodePanel,
  OverviewPanel,
  StepPanel,
  type PanelActions,
} from "./components/panel/Panels";
import panelStyles from "./components/panel/Panel.module.css";
import { Timeline } from "./components/timeline/Timeline";
import { TopBar } from "./components/topbar/TopBar";
import { useHashRoute } from "./data/useHashRoute";
import type { Theme } from "./data/useTheme";
import {
  NO_HIGHLIGHT,
  flowHighlight,
  selectionHighlight,
  stepEndpoints,
  type Highlight,
} from "./graph/highlight";
import { isTyping } from "./lib/keyboard";
import { clampStep, stepTiming, type Speed } from "./lib/playback";
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
  const [speed, setSpeed] = useState<Speed>(1);
  // Keyed by flow id so playback stops by itself when the flow changes or closes.
  const [playingFlow, setPlayingFlow] = useState<string>();
  // Keyed by step so an inspected node closes by itself when the replay moves on.
  const [inspected, setInspected] = useState<{ id: string; stepKey: string }>();
  const [searchFocus, setSearchFocus] = useState<CameraFocus>();

  const flow =
    route.view === "flow" ? architecture.flows.find((f) => f.id === route.flowId) : undefined;
  const index = flow && route.view === "flow" ? clampStep(route.step, flow.steps.length) - 1 : -1;
  const step = flow?.steps[index];
  const stepKey = flow ? `${flow.id}:${index}` : undefined;
  const playing = flow !== undefined && playingFlow === flow.id;
  const timing = step ? stepTiming(step, speed) : undefined;
  const inspectedId = inspected && inspected.stepKey === stepKey ? inspected.id : undefined;

  const routeSelection = route.view === "node" || route.view === "edge" ? route.id : undefined;
  const selectedId =
    routeSelection &&
    (architecture.nodes.some((n) => n.id === routeSelection) ||
      architecture.edges.some((e) => e.id === routeSelection))
      ? routeSelection
      : undefined;

  const highlight: Highlight = useMemo(() => {
    if (flow && timing) {
      return {
        ...flowHighlight(architecture, flow, index, timing.travelMs),
        selectedId: inspectedId,
      };
    }
    if (selectedId) return selectionHighlight(architecture, selectedId);
    return NO_HIGHLIGHT;
  }, [architecture, flow, index, timing?.travelMs, inspectedId, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ends = flow ? stepEndpoints(architecture, flow, index) : undefined;
  const stepFocus = useMemo<CameraFocus | undefined>(
    () => (stepKey && ends ? { key: stepKey, ids: [ends.from, ends.to] } : undefined),
    [stepKey, ends?.from, ends?.to], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const goTo = useCallback(
    (nextIndex: number) => {
      if (!flow) return;
      navigate(
        { view: "flow", flowId: flow.id, step: clampStep(nextIndex + 1, flow.steps.length) },
        { replace: true },
      );
    },
    [flow, navigate],
  );

  const openFlow = useCallback(
    (flowId: string | undefined, stepNumber = 1) => {
      setPlayingFlow(undefined);
      navigate(flowId ? { view: "flow", flowId, step: stepNumber } : OVERVIEW);
    },
    [navigate],
  );

  const togglePlay = useCallback(() => {
    if (!flow) return;
    if (playing) return setPlayingFlow(undefined);
    if (index === flow.steps.length - 1) goTo(0);
    setPlayingFlow(flow.id);
  }, [flow, playing, index, goTo]);

  const restart = useCallback(() => {
    if (!flow) return;
    goTo(0);
    setPlayingFlow(flow.id);
  }, [flow, goTo]);

  const select = useCallback(
    (id: string) => {
      if (stepKey) return setInspected({ id, stepKey });
      const isEdge = architecture.edges.some((edge) => edge.id === id);
      navigate({ view: isEdge ? "edge" : "node", id });
    },
    [architecture, stepKey, navigate],
  );

  const clear = useCallback(() => {
    if (stepKey) setInspected(undefined);
    else if (route.view !== "overview") navigate(OVERVIEW);
  }, [stepKey, route.view, navigate]);

  const pickNode = useCallback(
    (id: string) => {
      select(id);
      setSearchFocus({ key: `${id}:${Date.now()}`, ids: [id] });
    },
    [select],
  );

  const dwellMs = timing?.dwellMs;
  useEffect(() => {
    if (!playing || !flow || dwellMs === undefined) return;
    const timer = setTimeout(() => {
      if (index < flow.steps.length - 1) goTo(index + 1);
      else setPlayingFlow(undefined);
    }, dwellMs);
    return () => clearTimeout(timer);
  }, [playing, flow, index, dwellMs, goTo]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (flow) {
        if (event.key === " ") togglePlay();
        else if (event.key === "ArrowRight") goTo(index + 1);
        else if (event.key === "ArrowLeft") goTo(index - 1);
        else if (event.key === "Escape") {
          if (inspectedId) setInspected(undefined);
          else openFlow(undefined);
        } else return;
      } else if (event.key === "Escape") clear();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flow, index, inspectedId, togglePlay, goTo, openFlow, clear]);

  useEffect(() => {
    document.title = `${architecture.project.name} · Archbook`;
  }, [architecture.project.name]);

  const actions: PanelActions = { select, openFlow: (id, stepNumber) => openFlow(id, stepNumber) };
  const panelTarget = inspectedId ?? selectedId;
  let panel: ReactNode;
  let back: { label: string; onClick: () => void } | undefined;

  if (panelTarget) {
    const node = architecture.nodes.find((n) => n.id === panelTarget);
    const edge = architecture.edges.find((e) => e.id === panelTarget);
    panel = node ? (
      <NodePanel architecture={architecture} node={node} actions={actions} />
    ) : edge ? (
      <EdgePanel architecture={architecture} edge={edge} actions={actions} />
    ) : null;
    back = flow
      ? { label: `Back to step ${index + 1}`, onClick: () => setInspected(undefined) }
      : { label: "Overview", onClick: () => navigate(OVERVIEW) };
  } else if (flow && step) {
    panel = <StepPanel architecture={architecture} flow={flow} index={index} actions={actions} />;
  } else {
    panel = <OverviewPanel architecture={architecture} warnings={warnings} actions={actions} />;
  }

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
              index={index}
              playing={playing}
              speed={speed}
              dwellMs={timing.dwellMs}
              onGoTo={goTo}
              onTogglePlay={togglePlay}
              onRestart={restart}
              onSpeed={setSpeed}
              onClose={() => openFlow(undefined)}
            />
          )}
        </div>
        <aside className={panelStyles.panel} aria-label="Details">
          <div className={panelStyles.body} key={panelTarget ?? stepKey ?? "overview"}>
            {back && (
              <button type="button" className={panelStyles.back} onClick={back.onClick}>
                <ArrowLeft size={15} />
                {back.label}
              </button>
            )}
            {panel}
          </div>
        </aside>
      </div>
    </div>
  );
}
