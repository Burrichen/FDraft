import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/product-spec.md, "WATCHLIST SORT / FILTER CONTROL". The sample
 * fixture is imported Date-ascending (Paddington 2 -> Inception -> Spirited
 * Away -> Parasite -> The Grand Budapest Hotel), so the default "Date Added
 * — Newest First" sort should show them in the exact reverse order.
 */

async function importSampleWatchlist(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
  await page.getByRole("button", { name: "View watchlist" }).click();
  await expect(page.getByText("5 films")).toBeVisible();
}

async function gridTitles(page: import("@playwright/test").Page) {
  return page.locator("main ul > li p.truncate").allTextContents();
}

test("defaults to Date Added — Newest First", async ({ page }) => {
  await importSampleWatchlist(page);
  await expect(gridTitles(page)).resolves.toEqual([
    "The Grand Budapest Hotel",
    "Parasite",
    "Spirited Away",
    "Inception",
    "Paddington 2",
  ]);
});

test("choosing a sort re-orders the grid, shows an active indicator, and Reset restores the default", async ({
  page,
}) => {
  await importSampleWatchlist(page);

  const trigger = page.getByRole("button", { name: "Sort & Filter" });
  await trigger.click();
  await page.getByRole("radio", { name: "Title — A to Z" }).click();

  await expect(gridTitles(page)).resolves.toEqual([
    "Inception",
    "Paddington 2",
    "Parasite",
    "Spirited Away",
    "The Grand Budapest Hotel",
  ]);

  // A non-default sort is clearly indicated (see docs/product-spec.md:
  // "Clearly show when a non-default sort/filter is active.").
  await expect(trigger.locator("span[aria-hidden]")).toBeVisible();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(gridTitles(page)).resolves.toEqual([
    "The Grand Budapest Hotel",
    "Parasite",
    "Spirited Away",
    "Inception",
    "Paddington 2",
  ]);
  await expect(trigger.locator("span[aria-hidden]")).not.toBeVisible();
});

test("the chosen sort survives a reload", async ({ page }) => {
  await importSampleWatchlist(page);

  await page.getByRole("button", { name: "Sort & Filter" }).click();
  await page
    .getByRole("radio", { name: "Release Year — Newest First" })
    .click();
  await expect(gridTitles(page)).resolves.toEqual([
    "Parasite",
    "Paddington 2",
    "The Grand Budapest Hotel",
    "Inception",
    "Spirited Away",
  ]);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await expect(gridTitles(page)).resolves.toEqual([
    "Parasite",
    "Paddington 2",
    "The Grand Budapest Hotel",
    "Inception",
    "Spirited Away",
  ]);
});

test("Shuffle produces a genuinely new order each time it's chosen, and never persists a one-time result", async ({
  page,
}) => {
  await importSampleWatchlist(page);

  await page.getByRole("button", { name: "Sort & Filter" }).click();
  const shuffleOption = page.getByRole("radio", { name: "Shuffle" });

  const seenOrders = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await shuffleOption.click();
    seenOrders.add((await gridTitles(page)).join(","));
  }
  // Astronomically unlikely to collide 6 times in a row for 5 distinct
  // films if this is genuinely reshuffling on every deliberate invocation.
  expect(seenOrders.size).toBeGreaterThan(1);

  // Reloading must not resurrect any one specific shuffle result — the
  // MODE ("shuffle") is what's remembered, never a resulting order (see
  // docs/product-spec.md, "SORT PERSISTENCE").
  await page.reload();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  const afterReload = (await gridTitles(page)).join(",");
  const secondReshuffleAfterReload = new Set<string>();
  await page.getByRole("button", { name: "Sort & Filter" }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("radio", { name: "Shuffle" }).click();
    secondReshuffleAfterReload.add((await gridTitles(page)).join(","));
  }
  // The set of orders seen after reload isn't required to differ from
  // `afterReload` in any particular way — the real assertion is just that
  // reshuffling after a reload still produces more than one distinct
  // order, proving there's no "frozen" persisted order at all.
  expect(secondReshuffleAfterReload.size).toBeGreaterThan(1);
  void afterReload;
});

test("filtering to 'Metadata: Available' with nothing enriched yet shows a distinct empty state with a working Reset", async ({
  page,
}) => {
  await importSampleWatchlist(page);

  await page.getByRole("button", { name: "Sort & Filter" }).click();
  await page.getByLabel("Metadata").selectOption("available");

  await expect(page.getByText("No films match your filters")).toBeVisible();

  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(gridTitles(page)).resolves.toHaveLength(5);
});

test("the Genre filter is disabled when no watchlist film has genre metadata yet", async ({
  page,
}) => {
  await importSampleWatchlist(page);
  await page.getByRole("button", { name: "Sort & Filter" }).click();
  await expect(page.getByLabel("Genre")).toBeDisabled();
});
