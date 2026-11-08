// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SourceRef } from "@archbook/schema";
import { Links, SourceList } from "../src/components/panel/parts";

afterEach(cleanup);

const UNSAFE_URLS = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "mailto:team@example.com",
  "/relative/path",
  "not a url",
];

const hrefs = (container: HTMLElement) =>
  [...container.querySelectorAll("[href]")].map((element) => element.getAttribute("href"));

describe("Links", () => {
  it("links only http(s) URLs and shows the others as plain labels", () => {
    const links = [
      { label: "Docs", url: "https://docs.example.com/orders" },
      { label: "Grafana", url: "http://grafana/d/orders" },
      ...UNSAFE_URLS.map((url, index) => ({ label: `Unsafe ${index}`, url })),
    ];
    const { container, getByText } = render(<Links links={links} />);
    expect(hrefs(container)).toEqual([
      "https://docs.example.com/orders",
      "http://grafana/d/orders",
    ]);
    for (const index of UNSAFE_URLS.keys()) {
      expect(getByText(`Unsafe ${index}`).closest("a")).toBeNull();
    }
  });

  it("renders nothing without links", () => {
    expect(render(<Links links={[]} />).container.innerHTML).toBe("");
  });
});

describe("SourceList", () => {
  const sources: SourceRef[] = [{ path: "src/orders.ts", lines: [3, 9] }];

  it("links sources to the repository when it is http(s)", () => {
    const { container } = render(
      <SourceList
        sources={sources}
        project={{
          name: "Demo",
          description: "",
          defaultBranch: "main",
          repoUrl: "https://github.com/acme/shop",
        }}
      />,
    );
    expect(hrefs(container)).toEqual([
      "https://github.com/acme/shop/blob/main/src/orders.ts#L3-L9",
    ]);
  });

  it.each(UNSAFE_URLS)("never links sources under repoUrl %s", (repoUrl) => {
    const { container, getByText } = render(
      <SourceList
        sources={sources}
        project={{ name: "Demo", description: "", defaultBranch: "main", repoUrl }}
      />,
    );
    expect(hrefs(container)).toEqual([]);
    expect(getByText(/src\/orders\.ts/)).toBeDefined();
  });

  it("shows sources as text without a repository", () => {
    const { container } = render(
      <SourceList
        sources={sources}
        project={{ name: "Demo", description: "", defaultBranch: "main" }}
      />,
    );
    expect(hrefs(container)).toEqual([]);
  });
});
