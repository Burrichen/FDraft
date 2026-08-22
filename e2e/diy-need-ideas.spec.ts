import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(
  __dirname,
  "fixtures",
  "diy-recommendations-watchlist.csv",
);

const LONG_TITLE =
  "The Extraordinarily Long And Overly Descriptive Title Of A Film That Should Truncate Gracefully";

/**
 * See docs/updates, v1.1.1, "Centralise DIY recommendation eligibility" /
 * "Metadata integrity" / "Recommendation questions" / "Recommendation UX
 * polish" — end-to-end coverage (real IndexedDB, real CSV import, real
 * metadata fetch) that the "Need ideas?" sidebar only ever recommends
 * films with trustworthy data for whatever it's judging, stays in sync
 * with the main selection grid, and doesn't visibly break at a narrow
 * width with a long title.
 */
const METADATA_BY_TITLE: Record<
  string,
  {
    runtimeMinutes: number | null;
    averageRating: number | null;
    releaseDate: string | null;
    releaseStatus: string | null;
  }
> = {
  [LONG_TITLE]: {
    runtimeMinutes: 58,
    averageRating: 4.9,
    releaseDate: "2015-01-01",
    releaseStatus: "Released",
  },
  "Ancient Reel": {
    runtimeMinutes: 200,
    averageRating: 3.0,
    releaseDate: "1930-01-01",
    releaseStatus: "Released",
  },
  "Brand New Release": {
    runtimeMinutes: 95,
    averageRating: 4.0,
    releaseDate: "2026-01-01",
    releaseStatus: "Released",
  },
  "No Data Film": {
    runtimeMinutes: null,
    averageRating: null,
    releaseDate: null,
    releaseStatus: null,
  },
  "Mid Film A": {
    runtimeMinutes: 110,
    averageRating: 3.5,
    releaseDate: "2012-01-01",
    releaseStatus: "Released",
  },
  "Mid Film B": {
    runtimeMinutes: 130,
    averageRating: 3.2,
    releaseDate: "2013-01-01",
    releaseStatus: "Released",
  },
  "Upcoming Sequel": {
    runtimeMinutes: null,
    averageRating: null,
    releaseDate: null,
    releaseStatus: "Planned",
  },
};

test("DIY Draft 'Need ideas?' only recommends trustworthy-data films, stays in sync with the main grid, and holds layout at a narrow width with a long title", async ({
  page,
}) => {
  await page.route("**/api/metadata", async (route) => {
    const body = route.request().postDataJSON() as { title: string };
    const result = METADATA_BY_TITLE[body.title];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "matched",
        providerId: "tmdb",
        result: { ...result, posterUrl: null },
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Download Missing Metadata" }).click();
  await expect(page.getByText("7 matched.")).toBeVisible();

  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await page.getByRole("button", { name: /Baby/ }).click();
  await page.getByRole("radio", { name: /Build My Own Draft/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Build your own draft" }),
  ).toBeVisible();

  // --- An unreleased/future title (v1.1.2, "Fix unreleased-film
  // handling") must never appear anywhere — not the main grid, not any
  // recommendation.
  await expect(page.getByText("Upcoming Sequel")).toHaveCount(0);

  // --- Highest rated: excludes "No Data Film" (no rating), ranks the
  // long-titled film (4.9) first.
  const highestRated = page
    .locator("details")
    .filter({ hasText: "What are my highest rated movies?" });
  await highestRated.locator("summary").click();
  await expect(highestRated.getByText("No Data Film")).toHaveCount(0);
  const highestRatedRows = highestRated.locator("ul").getByRole("button");
  await expect(highestRatedRows.first()).toContainText(LONG_TITLE);
  await expect(highestRatedRows.first()).toContainText("★ 4.9");

  // --- Something short: only runtime < 120 qualifies — excludes the
  // 200min and 130min films and the film with no runtime at all.
  const somethingShort = page
    .locator("details")
    .filter({ hasText: "I want something short" });
  await somethingShort.locator("summary").click();
  await expect(somethingShort.getByText("Ancient Reel")).toHaveCount(0);
  await expect(somethingShort.getByText("Mid Film B")).toHaveCount(0);
  await expect(somethingShort.getByText("No Data Film")).toHaveCount(0);
  await expect(somethingShort.getByText(LONG_TITLE)).toBeVisible();

  // --- Something recent: newest release year first.
  const somethingRecent = page
    .locator("details")
    .filter({ hasText: "I want something recent" });
  await somethingRecent.locator("summary").click();
  await expect(
    somethingRecent.locator("ul").getByRole("button").first(),
  ).toContainText("Brand New Release");
  await expect(somethingRecent.getByText("Upcoming Sequel")).toHaveCount(0);

  // --- Take me back: oldest release year first.
  const takeMeBack = page
    .locator("details")
    .filter({ hasText: "Take me back" });
  await takeMeBack.locator("summary").click();
  await expect(
    takeMeBack.locator("ul").getByRole("button").first(),
  ).toContainText("Ancient Reel");

  // --- Selecting via the sidebar stays in sync with the main grid, and
  // never auto-selects anything on its own until clicked.
  await expect(page.getByText("0 / 5 selected")).toBeVisible();
  await highestRatedRows.first().click();
  await expect(page.getByText("1 / 5 selected")).toBeVisible();
  const mainGrid = page.getByRole("list", { name: "Eligible films" });
  await expect(
    mainGrid.locator("button", { hasText: LONG_TITLE }),
  ).toContainText("Selected");

  // --- Narrow-width layout: the long title must never force the page to
  // scroll horizontally, in either the main grid or the sidebar.
  await page.setViewportSize({ width: 375, height: 800 });
  const overflowsHorizontally = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflowsHorizontally).toBe(false);
});
