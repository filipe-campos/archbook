import { useCallback, useEffect, useState } from "react";
import type { ArchFlow } from "@archbook/schema";
import { stepTiming, type Speed, type StepTiming } from "../lib/playback";

export interface Playback {
  playing: boolean;
  speed: Speed;
  setSpeed: (speed: Speed) => void;
  /** Timing of the current step, when there is one. */
  timing: StepTiming | undefined;
  togglePlay: () => void;
  restart: () => void;
  stop: () => void;
}

interface PlaybackOptions {
  flow: ArchFlow | undefined;
  stepIndex: number;
  goTo: (stepIndex: number) => void;
}

/** Auto-advances the open flow while playing. */
export function usePlayback({ flow, stepIndex, goTo }: PlaybackOptions): Playback {
  const [speed, setSpeed] = useState<Speed>(1);
  // Keyed by flow id so playback stops by itself when the flow changes or closes.
  const [playingFlow, setPlayingFlow] = useState<string>();
  const flowId = flow?.id;
  const lastIndex = flow ? flow.steps.length - 1 : -1;
  const step = flow?.steps[stepIndex];
  const playing = flowId !== undefined && playingFlow === flowId;
  const timing = step ? stepTiming(step, speed) : undefined;
  const dwellMs = timing?.dwellMs;

  const togglePlay = useCallback(() => {
    if (flowId === undefined) return;
    if (playing) return setPlayingFlow(undefined);
    if (stepIndex === lastIndex) goTo(0);
    setPlayingFlow(flowId);
  }, [flowId, playing, stepIndex, lastIndex, goTo]);

  const restart = useCallback(() => {
    if (flowId === undefined) return;
    goTo(0);
    setPlayingFlow(flowId);
  }, [flowId, goTo]);

  const stop = useCallback(() => setPlayingFlow(undefined), []);

  useEffect(() => {
    if (!playing || dwellMs === undefined) return;
    const timer = setTimeout(() => {
      if (stepIndex < lastIndex) goTo(stepIndex + 1);
      else setPlayingFlow(undefined);
    }, dwellMs);
    return () => clearTimeout(timer);
  }, [playing, stepIndex, lastIndex, dwellMs, goTo]);

  return { playing, speed, setSpeed, timing, togglePlay, restart, stop };
}
