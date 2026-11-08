import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Undo2, X, Zap } from "lucide-react";
import type { ArchFlow } from "@archbook/schema";
import { cx } from "../../lib/cx";
import { SPEEDS, type Speed } from "../../lib/playback";
import styles from "./Timeline.module.css";

export interface TimelineProps {
  flow: ArchFlow;
  /** 0-based index of the current step. */
  index: number;
  playing: boolean;
  speed: Speed;
  /** How long the current step stays on screen while playing, for the progress bar. */
  dwellMs: number;
  onGoTo: (index: number) => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSpeed: (speed: Speed) => void;
  onClose: () => void;
}

export function Timeline({
  flow,
  index,
  playing,
  speed,
  dwellMs,
  onGoTo,
  onTogglePlay,
  onRestart,
  onSpeed,
  onClose,
}: TimelineProps) {
  const list = useRef<HTMLOListElement>(null);
  const last = flow.steps.length - 1;

  useEffect(() => {
    const active = list.current?.children[index] as HTMLElement | undefined;
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  return (
    <div className={styles.timeline} aria-label={`Replay of ${flow.name}`}>
      <p className={styles.announcement} aria-live="polite">
        Step {index + 1} of {flow.steps.length}: {flow.steps[index]?.title}
      </p>
      <div className={styles.controls}>
        <button type="button" className={styles.button} onClick={onRestart} title="Restart">
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => onGoTo(index - 1)}
          disabled={index === 0}
          title="Previous step (←)"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className={cx(styles.button, styles.play)}
          onClick={onTogglePlay}
          title={playing ? "Pause (space)" : "Play (space)"}
        >
          {playing ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => onGoTo(index + 1)}
          disabled={index === last}
          title="Next step (→)"
        >
          <ChevronRight size={18} />
        </button>
        <span className={styles.counter}>
          {index + 1} / {flow.steps.length}
        </span>
        <div className={styles.speeds} role="group" aria-label="Speed">
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              className={cx(styles.speed, value === speed && styles.speedActive)}
              onClick={() => onSpeed(value)}
              aria-pressed={value === speed}
            >
              {value}x
            </button>
          ))}
        </div>
        <span className={styles.flowName} title={flow.summary}>
          {flow.name}
        </span>
        <button type="button" className={styles.button} onClick={onClose} title="Close flow (Esc)">
          <X size={16} />
        </button>
      </div>
      <ol className={styles.steps} ref={list} style={{ listStyle: "none", margin: 0 }}>
        {flow.steps.map((step, i) => (
          <li key={i}>
            <button
              type="button"
              className={cx(
                styles.step,
                i < index && styles.stepDone,
                i === index && styles.stepActive,
              )}
              onClick={() => onGoTo(i)}
              aria-current={i === index ? "step" : undefined}
            >
              <span className={styles.number}>{i + 1}</span>
              <span className={styles.stepText}>
                <span className={styles.stepTitle}>{step.title}</span>
                {(step.async || step.reverse) && (
                  <span className={styles.stepTags}>
                    {step.async && (
                      <span>
                        <Zap size={11} /> async
                      </span>
                    )}
                    {step.reverse && (
                      <span>
                        <Undo2 size={11} /> response
                      </span>
                    )}
                  </span>
                )}
              </span>
              {i === index && playing && (
                <span
                  key={`${index}:${speed}`}
                  className={styles.progress}
                  style={{ animationDuration: `${dwellMs}ms` }}
                />
              )}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
