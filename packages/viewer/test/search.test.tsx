// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "../src/components/topbar/TopBar";
import { searchNodes } from "../src/lib/search";
import { example } from "./example";

afterEach(cleanup);

function renderSearch() {
  const onPickNode = vi.fn();
  render(
    <TopBar
      projectName={example.project.name}
      flows={example.flows}
      nodes={example.nodes}
      theme="light"
      onOpenFlow={() => {}}
      onPickNode={onPickNode}
      onToggleTheme={() => {}}
    />,
  );
  const input = screen.getByRole("combobox", { name: "Search components" }) as HTMLInputElement;
  return { input, onPickNode };
}

const QUERY = "worker";
const matches = searchNodes(example.nodes, QUERY);

const listbox = () => screen.getByRole("listbox", { name: "Matching components", hidden: true });
const options = () => within(listbox()).getAllByRole("option");

const activeOption = (input: HTMLInputElement) => {
  const id = input.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id) : null;
};

describe("search", () => {
  it("focuses with / and lists the matches as options", () => {
    const { input } = renderSearch();
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: QUERY } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const shown = options();
    expect(shown.map((option) => option.textContent)).toEqual(
      matches.map((node) => expect.stringContaining(node.name)),
    );
    expect(activeOption(input)).toBe(shown[0]);
    expect(shown[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("moves with ArrowDown and picks with Enter", () => {
    expect(matches.length).toBeGreaterThan(1);
    const { input, onPickNode } = renderSearch();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: QUERY } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const shown = options();
    expect(activeOption(input)).toBe(shown[1]);
    expect(shown[1]!.getAttribute("aria-selected")).toBe("true");
    expect(shown[0]!.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPickNode).toHaveBeenCalledWith(matches[1]!.id);
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("clears the query with Escape", () => {
    const { input, onPickNode } = renderSearch();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: QUERY } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(input.getAttribute("aria-controls")!)?.hidden).toBe(true);
    expect(onPickNode).not.toHaveBeenCalled();
  });

  it("says when nothing matches", () => {
    const { input, onPickNode } = renderSearch();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz-nothing" } });
    expect(screen.getByRole("status").textContent).toBe("No matching components");
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPickNode).not.toHaveBeenCalled();
  });
});
