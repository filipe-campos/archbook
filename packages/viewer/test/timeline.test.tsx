// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Timeline, type TimelineProps } from "../src/components/timeline/Timeline";
import { example } from "./example";

afterEach(cleanup);

const flow = example.flows[0]!;

function renderTimeline(props: Partial<TimelineProps> = {}) {
  const handlers = {
    onGoTo: vi.fn(),
    onTogglePlay: vi.fn(),
    onRestart: vi.fn(),
    onSpeed: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <Timeline
      flow={flow}
      index={0}
      playing={false}
      speed={1}
      dwellMs={2000}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const button = (title: string) => screen.getByTitle(title) as HTMLButtonElement;

describe("Timeline", () => {
  it("disables the previous step on the first step", () => {
    const handlers = renderTimeline({ index: 0 });
    expect(button("Previous step (←)").disabled).toBe(true);
    expect(button("Next step (→)").disabled).toBe(false);
    fireEvent.click(button("Next step (→)"));
    expect(handlers.onGoTo).toHaveBeenCalledWith(1);
  });

  it("disables the next step on the last step", () => {
    const last = flow.steps.length - 1;
    const handlers = renderTimeline({ index: last });
    expect(button("Next step (→)").disabled).toBe(true);
    expect(button("Previous step (←)").disabled).toBe(false);
    fireEvent.click(button("Previous step (←)"));
    expect(handlers.onGoTo).toHaveBeenCalledWith(last - 1);
  });

  it("calls the playback handlers", () => {
    const handlers = renderTimeline({ index: 2 });
    fireEvent.click(button("Play (space)"));
    fireEvent.click(button("Restart"));
    fireEvent.click(button("Close flow (Esc)"));
    fireEvent.click(screen.getByRole("button", { name: "2x" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(flow.steps[4]!.title) }));
    expect(handlers.onTogglePlay).toHaveBeenCalledOnce();
    expect(handlers.onRestart).toHaveBeenCalledOnce();
    expect(handlers.onClose).toHaveBeenCalledOnce();
    expect(handlers.onSpeed).toHaveBeenCalledWith(2);
    expect(handlers.onGoTo).toHaveBeenCalledWith(4);
  });

  it("marks the current step and announces it", () => {
    renderTimeline({ index: 1, playing: true });
    expect(button("Pause (space)")).toBeDefined();
    const current = screen.getByRole("button", { current: "step" });
    expect(current.textContent).toContain(flow.steps[1]!.title);
    expect(
      screen.getByText(`Step 2 of ${flow.steps.length}: ${flow.steps[1]!.title}`),
    ).toBeDefined();
  });
});
