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
 * API — this test isn't trying to verify TMDB's behavior. What it verifies
 * is FDraft's OWN contract: a WATCHLIST film is enriched only on the
 * explicit "Download Missing Metadata" click, never automatically, and
 * never again afterward — exactly the boundary
 * `src/app/api/metadata/route.ts`'s own doc comment describes ("Nothing
 * about a challenge's normal execution ever reaches this route").
 *
 * The count is scoped to the FIXTURE'S OWN five titles rather than being a
 * global request tally. A global tally silently stopped measuring this
 * contract once Static Event Film Content Packs began resolve-or-creating
 * each Event's curated films at app start and enriching whichever ones
 * were newly created (see `loadEventCategoryFilmContent`) — that is a
 * separate, deliberate startup activity for curated EVENT content, has
 * nothing to do with a profile's watchlist, and grows every time a curated
 * list does, so it swamped the number this test cares about. Scoping by
 * title measures the real rule again, and the "ordinary execution adds
 * ZERO further calls" assertion below is now a strict delta rather than an
 * absolute, which is the part that actually catches a regression.
 */
test("metadata enriched while online remains available offline, and nothing ever re-fetches it", async ({
  page,
  context,
}) => {
  /** The fixture's own five titles — see `e2e/fixtures/sample-watchlist.csv`. */
  const WATCHLIST_TITLES = [
    "Paddington 2",
    "Inception",
    "Spirited Away",
    "Parasite",
    "The Grand Budapest Hotel",
  ];
  let watchlistRequestCount = 0;
  await page.route("**/api/metadata", async (route) => {
    const body = route.request().postDataJSON() as { title: string };
    if (WATCHLIST_TITLES.includes(body.title)) {
      watchlistRequestCount++;
    }
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
  // Exactly one call per watchlist film, and not one more.
  expect(watchlistRequestCount).toBe(5);

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
  await expect(
    page.getByRole("heading", { name: /Baby draft/i }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Mark ".*" as watched$/ })
    .first()
    .click();
  await expect(page.getByText(/1\/5 watched/)).toBeVisible();

  await page.getByRole("link", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();

  // Still exactly five — drafting, marking watched and Stats never
  // re-fetch a film whose metadata is already cached. Deliberately NOT
  // also asserting on the global request total: the app shell's curated
  // Event content enrichment is fire-and-forget and unbounded in time, so
  // a global delta is a race, not a contract. The scoped count IS the
  // contract this test exists for.
  expect(watchlistRequestCount).toBe(5);
});
