// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_RELOAD_EVENT, LIVE_RELOAD_META } from "@archbook/schema";
import { App } from "../src/App";
import { exampleText } from "./example";

vi.mock("../src/Viewer", () => ({
  Viewer: ({ architecture }: { architecture: { project: { name: string } } }) => (
    <main>{architecture.project.name}</main>
  ),
}));

/** Stands in for the dev server's event stream; `emit` fires a reload. */
class FakeEventSource {
  static last: FakeEventSource | undefined;
  private listeners = new Map<string, () => void>();
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  close() {}
  emit(type: string) {
    this.listeners.get(type)?.();
  }
}

let responses: Array<() => Response>;

beforeEach(() => {
  responses = [];
  const meta = document.createElement("meta");
  meta.name = LIVE_RELOAD_META;
  meta.content = "/__archbook/events";
  document.head.append(meta);
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error("unexpected fetch");
      return next();
    }),
  );
});

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

const json = (text: string) => () => new Response(text, { status: 200 });

async function reload(response: () => Response) {
  responses.push(response);
  await act(async () => FakeEventSource.last!.emit(LIVE_RELOAD_EVENT));
}

describe("ReloadBanner", () => {
  it("keeps the last valid document and lists the errors of an invalid reload", async () => {
    responses.push(json(exampleText));
    render(<App />);
    await screen.findByText("Shop Checkout");
    expect(screen.queryByRole("status")).toBeNull();

    const broken = JSON.parse(exampleText) as { edges: Array<{ to: string }> };
    broken.edges[0]!.to = "nowhere";
    await reload(json(JSON.stringify(broken)));

    const banner = await screen.findByRole("status");
    expect(banner.textContent).toMatch(
      /architecture\.json has 1 error\. Showing the last valid version\./,
    );
    expect(banner.textContent).toMatch(/edges\[0\]\.to: .*nowhere/);
    expect(screen.getByText("Shop Checkout")).toBeDefined();

    await reload(json(exampleText));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("says when the file went missing", async () => {
    responses.push(json(exampleText));
    render(<App />);
    await screen.findByText("Shop Checkout");
    await reload(() => new Response("", { status: 404, statusText: "Not Found" }));
    const banner = await screen.findByRole("status");
    expect(banner.textContent).toMatch(/architecture\.json is missing/);
    expect(banner.textContent).toMatch(/404 Not Found/);
  });
});
