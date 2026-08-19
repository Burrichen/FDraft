import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(
  __dirname,
  "fixtures",
  "mission-impossible-watchlist.csv",
);

/**
 * See docs/updates, v1.1.2, "Fix DIY Draft missing watchlist films" — the
 * generated/random-draft "no unstarted later series entry" rule must never
 * apply to DIY/manual selection: with several unwatched Mission:
 * Impossible films on the watchlist, all of them must be selectable (and
 * findable via search), not just the earliest one.
 */
test("DIY Draft picker exposes every Mission: Impossible sequel via search, not just the earliest", async ({
  page,
}) => {
  await page.route("**/api/metadata", async (route) => {
    const body = route.request().postDataJSON() as { title: string };
    const isMissionImpossible = body.title.startsWith("Mission: Impossible");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "matched",
        providerId: "tmdb",
        result: {
          posterUrl: null,
          runtimeMinutes: 120,
          releaseDate: "2010-01-01",
          releaseStatus: "Released",
          collectionId: isMissionImpossible
            ? "mission-impossible-collection"
            : null,
        },
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
  await expect(page.getByText("5 matched.")).toBeVisible();

  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await page.getByRole("button", { name: /Freeform/ }).click();
  await page.getByRole("radio", { name: /Build My Own Draft/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Build your own draft" }),
  ).toBeVisible();

  await page
    .getByRole("searchbox", { name: "Search your watchlist by title" })
    .fill("miss");

  const grid = page.getByRole("list", { name: "Eligible films" });
  await expect(
    grid.getByText("Mission: Impossible", { exact: true }),
  ).toBeVisible();
  await expect(
    grid.getByText("Mission: Impossible II", { exact: true }),
  ).toBeVisible();
  await expect(
    grid.getByText("Mission: Impossible III", { exact: true }),
  ).toBeVisible();
  await expect(
    grid.getByText("Mission: Impossible - Ghost Protocol", { exact: true }),
  ).toBeVisible();
  await expect(grid.getByText("Unrelated Comedy")).toHaveCount(0);
});
