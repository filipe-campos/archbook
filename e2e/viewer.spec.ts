import { archNodes, detailsPanel, example, expect, test } from "./fixtures.ts";

const flow = example.flows[0]!;

test("renders every component of the example", async ({ page }) => {
  const elkRequests: string[] = [];
  page.on("request", (request) => {
    if (/elk\.bundled/.test(request.url())) elkRequests.push(request.url());
  });
  await page.goto("./");
  await expect(page).toHaveTitle(new RegExp(example.project.name));
  await expect(archNodes(page)).toHaveCount(example.nodes.length);
  // The layout ran in the worker, so the policy lets it start.
  expect(elkRequests).toEqual([]);
});

test("opens a flow step from the URL and steps with the keyboard", async ({ page }) => {
  await page.goto(`./#/flow/${flow.id}/step/2`);
  await expect(detailsPanel(page)).toContainText(flow.steps[1]!.title);

  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`#/flow/${flow.id}/step/3$`));
  await expect(detailsPanel(page)).toContainText(flow.steps[2]!.title);

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/#\/flow\//);
  await expect(page.getByRole("button", { name: /Close flow/ })).toHaveCount(0);
});

test("searches with / and opens the chosen component", async ({ page }) => {
  const node = example.nodes.find((candidate) => candidate.kind === "service")!;
  await page.goto("./");
  await expect(archNodes(page)).toHaveCount(example.nodes.length);

  await page.keyboard.press("/");
  const search = page.getByRole("combobox", { name: "Search components" });
  await expect(search).toBeFocused();
  await search.fill(node.name);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(new RegExp(`#/node/${node.id}$`));
  await expect(detailsPanel(page)).toContainText(node.summary);
});
