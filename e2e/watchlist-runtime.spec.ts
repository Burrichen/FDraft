import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/product-spec.md, "SHOW RUNTIME ON WATCHLIST" — runtime is shown
 * on the main Watchlist film cards when available, formatted as "N min"
 * alongside the existing year/rating metadata, and simply omitted (never
 * "N/A") when a film has no runtime yet.
 */
test("shows runtime alongside year and rating when available, and omits it gracefully — never as 'N/A' — when it isn't", async ({
  page,
}) => {
  await page.route("**/api/metadata", async (route) => {
    const body = route.request().postDataJSON() as { title: string };
    // "Parasite" deliberately has no runtime yet, to prove graceful
    // omission alongside films that do have one.
    const runtimeMinutes = body.title === "Parasite" ? null : 104;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "matched",
        providerId: "tmdb",
        result: {
          posterUrl: `https://example.invalid/poster/${encodeURIComponent(body.title)}.jpg`,
          runtimeMinutes,
          genres: ["Comedy", "Family"],
          directors: ["Test Director"],
          averageRating: 4.2,
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

  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  // A film with a known runtime shows "N min" alongside year and rating,
  // in the plain-minutes format — never converted to "Xh Ym".
  const inceptionCard = page
    .locator("a", { hasText: "Inception" })
    .filter({ hasText: "2010" });
  await expect(inceptionCard.getByText(/104 min/)).toBeVisible();
  await expect(inceptionCard.getByText(/2h/)).toHaveCount(0);

  // A film with no runtime yet omits it gracefully — the year/rating
  // still show, and "N/A" never appears anywhere on the page.
  const parasiteCard = page
    .locator("a", { hasText: "Parasite" })
    .filter({ hasText: "2019" });
  await expect(parasiteCard.getByText("2019")).toBeVisible();
  await expect(parasiteCard.getByText(/min/)).toHaveCount(0);
  await expect(page.getByText("N/A")).toHaveCount(0);
});
