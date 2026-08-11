import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/product-spec.md, "FULL OFFLINE CORE FUNCTIONALITY" and
 * "TESTING" — Prompt 9.5B: "Test the application with metadata-provider/
 * network requests failing... Where possible include Playwright tests
 * executed with the browser context offline."
 *
 * Next.js's client router fetches a small RSC payload the first time it
 * transitions to a given route in a given tab, even for a fully "use
 * client" page with no server data — that first transition is a real
 * network request, purely a framework/tooling detail, not a violation of
 * "the app works offline" (see docs/product-spec.md, "NETWORK FAILURE").
 * `page.goto()` (a full reload) throws away that router cache each time,
 * so the warm-up pass below clicks through the exact same journey once
 * while online — populating the SAME tab's router cache — before the test
 * repeats it for real with the browser fully offline.
 */
test("watchlist import, draft creation, marking watched, and stats all work with the browser fully offline", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  async function visitEveryRouteByClicking() {
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Import your watchlist" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Watchlist" }).click();
    await expect(
      page.getByRole("heading", { name: "Watchlist" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Drafts" }).click();
    await expect(
      page
        .getByRole("heading", { name: "Active draft" })
        .or(page.getByRole("heading", { name: /draft/i })),
    ).toBeVisible();
    await page.getByRole("link", { name: "Stats" }).click();
    await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
    await page.getByRole("link", { name: "Watchlist" }).click();
    await expect(
      page.getByRole("heading", { name: "Watchlist" }),
    ).toBeVisible();
  }

  // Warm-up pass (online): populate this tab's client router cache for
  // every route this test will revisit, via the exact same in-app clicks —
  // not `page.goto()`, which would throw that cache away each time.
  await visitEveryRouteByClicking();

  await page.context().setOffline(true);

  // --- Import a Letterboxd watchlist CSV, fully offline ---
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Import your watchlist" }),
  ).toBeVisible();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.getByRole("button", { name: "View watchlist" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await expect(page.getByText("5 films")).toBeVisible();

  // --- Create a draft, fully offline ---
  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Start a draft" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Baby/ }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Baby draft/ })).toBeVisible();

  // --- Mark a film watched, fully offline ---
  const firstEyeButton = page
    .getByRole("button", { name: /^Mark ".*" as watched$/ })
    .first();
  await firstEyeButton.click();
  await expect(page.getByText(/1\/5 watched/)).toBeVisible();

  // --- Stats reflect it, fully offline ---
  await page.getByRole("link", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page.getByText("Watched", { exact: true })).toBeVisible();
});

test("importing while offline never blocks on metadata — films are stored immediately, metadata reported as awaiting download", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Import your watchlist" }),
  ).toBeVisible();

  await page.context().setOffline(true);

  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page.getByText("Import complete")).toBeVisible();
  await expect(page.getByText(/awaiting download/)).toBeVisible();
});
