import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/product-spec.md, "FILM CARD LAYOUT" — a film with full
 * metadata (year/runtime/rating/genres) and a film with only a bare year
 * must render at the SAME card height within a grid row, never a
 * shorter-looking card for the unresolved film.
 */
test("film cards are the same height in a grid row regardless of how much metadata each film has", async ({
  page,
}) => {
  await page.route("**/api/metadata", async (route) => {
    const body = route.request().postDataJSON() as { title: string };
    // Only enrich one film — the rest stay bare (title + year only),
    // reproducing the exact mixed-metadata scenario from the bug report.
    const enrich = body.title === "Inception";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        enrich
          ? {
              status: "matched",
              providerId: "tmdb",
              result: {
                posterUrl: "https://example.invalid/poster/inception.jpg",
                runtimeMinutes: 148,
                genres: ["Action", "Sci-Fi"],
                directors: ["Test Director"],
                averageRating: 4.2,
              },
            }
          : { status: "unresolved", providerId: "tmdb" },
      ),
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
  await expect(page.getByText(/matched.*failed|failed.*matched/)).toBeVisible();

  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  const enrichedCard = page.locator("li").filter({ hasText: "Inception" });
  const bareCard = page.locator("li").filter({ hasText: "Parasite" });

  const enrichedBox = await enrichedCard.boundingBox();
  const bareBox = await bareCard.boundingBox();

  expect(enrichedBox).not.toBeNull();
  expect(bareBox).not.toBeNull();
  expect(Math.abs(enrichedBox!.height - bareBox!.height)).toBeLessThanOrEqual(
    1,
  );

  // The bare card never fabricates placeholder metadata.
  await expect(bareCard.getByText("N/A")).toHaveCount(0);
  await expect(bareCard.getByText(/·\s*·/)).toHaveCount(0);
});
