import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/product-spec.md, "METADATA RECONNECTION TEST" and "FINAL TEST
 * MATRIX" — Prompt 9.5D: enrich while online, go offline, verify the
 * downloaded metadata remains available and that "no challenge should make
 * unnecessary metadata calls during ordinary execution."
 *
 * `/api/metadata` is intercepted here rather than hitting the real TMDB
 * API — this test has no `TMDB_API_KEY` configured (correctly — see
 * `.env.example`, nothing in this repo should depend on a real third-party
 * credential to run its test suite) and isn't trying to verify TMDB's
 * behavior anyway. What it verifies is FDraft's OWN contract: enrichment
 * only ever happens on the explicit "Download Missing Metadata" click,
 * never automatically, and never again afterward for the same films —
 * exactly the boundary `src/app/api/metadata/route.ts`'s own doc comment
 * describes ("Nothing about a challenge's normal execution ever reaches
 * this route").
 */
test("metadata enriched while online remains available offline, and nothing ever re-fetches it", async ({
  page,
  context,
}) => {
  let metadataRequestCount = 0;
  await page.route("**/api/metadata", async (route) => {
    metadataRequestCount++;
    const body = route.request().postDataJSON() as { title: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "matched",
        providerId: "tmdb",
        result: {
          posterUrl: `https://example.invalid/poster/${encodeURIComponent(body.title)}.jpg`,
          runtimeMinutes: 104,
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
  await expect(
    page.getByText(/5 films.*awaiting download|awaiting download/),
  ).toBeVisible();

  // --- Enrich while online ---
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Download Missing Metadata" }).click();
  await expect(page.getByText("5 matched.")).toBeVisible();
  expect(metadataRequestCount).toBe(5);

  // --- Go offline: the downloaded metadata must still be there ---
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Films cached")).toBeVisible();
  const missingMetadataCount = await page
    .locator("dt", { hasText: "Missing metadata" })
    .locator("xpath=following-sibling::dd")
    .innerText();
  expect(missingMetadataCount.trim()).toBe("0");

  // --- Ordinary execution (draft creation, marking watched, stats) must
  // never call the metadata endpoint again, offline or not ---
  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await page.getByRole("button", { name: /^Baby/ }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Baby draft/ })).toBeVisible();
  await page
    .getByRole("button", { name: /^Mark ".*" as watched$/ })
    .first()
    .click();
  await expect(page.getByText(/1\/5 watched/)).toBeVisible();

  await page.getByRole("link", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();

  expect(metadataRequestCount).toBe(5);
});
