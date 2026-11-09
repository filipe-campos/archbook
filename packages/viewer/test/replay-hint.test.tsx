// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplayHint } from "../src/components/canvas/ReplayHint";
import { example } from "./example";

afterEach(cleanup);

describe("ReplayHint", () => {
  it("replays the first flow and counts the others", () => {
    const onOpenFlow = vi.fn();
    render(<ReplayHint flows={example.flows} onOpenFlow={onOpenFlow} />);
    const first = example.flows[0]!;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(first.name) }));
    expect(onOpenFlow).toHaveBeenCalledWith(first.id);
    expect(screen.getByText(`${first.steps.length} steps`)).toBeTruthy();
    expect(screen.getByText(`+${example.flows.length - 1} more in the panel`)).toBeTruthy();
  });

  it("hides the count when there is a single flow", () => {
    render(<ReplayHint flows={example.flows.slice(0, 1)} onOpenFlow={vi.fn()} />);
    expect(screen.queryByText(/more in the panel/)).toBeNull();
  });

  it("renders nothing without flows", () => {
    const { container } = render(<ReplayHint flows={[]} onOpenFlow={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
