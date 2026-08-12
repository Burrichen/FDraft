import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/product-spec.md, "UNRESOLVED METADATA RESOLUTION" — Prompt 10,
 * Part 4. Covers the full loop: a batch download leaves some films
 * unresolved/failed, the counts persist and are clickable, the dedicated
 * screen shows candidates, and picking one immediately clears the film
 * from the queue and updates its watchlist card.
 */
test("unresolved and failed films can be reviewed, resolved by picking a candidate, and persist across reload", async ({
  page,
}) => {
  await page.route("**/api/metadata", async (route) => {
    const body = route.request().postDataJSON() as { title: string };
    if (body.title === "Inception") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ambiguous",
          providerId: "tmdb",
          candidates: [],
        }),
      });
      return;
    }
    if (body.title === "Parasite") {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          status: "provider-error",
          providerId: "tmdb",
          message: "TMDB is down",
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "matched",
        providerId: "tmdb",
        result: { runtimeMinutes: 104, averageRating: 4.2 },
      }),
    });
  });

  await page.route("**/api/metadata/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        providerId: "tmdb",
        candidates: [
          {
            providerId: "tmdb",
            externalId: "27205",
            title: "Inception",
            releaseYear: 2010,
            confidence: 0.95,
            result: {
              posterUrl: "https://example.invalid/inception.jpg",
              runtimeMinutes: 148,
              directors: ["Christopher Nolan"],
              genres: ["Action", "Sci-Fi"],
              averageRating: 4.4,
              externalIds: { tmdb: "27205" },
            },
          },
        ],
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
  await expect(page.getByText(/matched.*unresolved.*failed/)).toBeVisible();

  // Persistent, clickable — not just the transient run summary. The count
  // itself lives in a sibling `<dd>`, not inside the link (see
  // docs/product-spec.md, "COMPLETE PRODUCT AUDIT" — the link wraps only
  // the `<dt>` label, keeping the dt/dd accessibility pairing intact
  // rather than nesting both inside a single `<a>`).
  const needsReviewLink = page.getByRole("link", { name: /Needs review/ });
  await expect(needsReviewLink).toBeVisible();
  const needsReviewStat = needsReviewLink.locator("xpath=../..");
  await expect(needsReviewStat).toContainText("2");
  await needsReviewLink.click();

  await expect(
    page.getByRole("heading", { name: "Unresolved metadata" }),
  ).toBeVisible();
  await expect(page.getByText("Unresolved (1)")).toBeVisible();
  await expect(page.getByText("Failed (1)")).toBeVisible();
  await expect(page.getByText("Could not confidently choose")).toBeVisible();
  await expect(
    page.getByText("The metadata provider returned an unexpected error."),
  ).toBeVisible();

  // Expand the unresolved film and pick a candidate.
  await page.getByRole("button", { name: /Inception/ }).click();
  await expect(page.getByText("Christopher Nolan")).toBeVisible();
  await page.getByRole("button", { name: "Use This Film" }).click();
  await expect(page.getByText('Matched "Inception"')).toBeVisible();
  await expect(page.getByText("Unresolved (0)")).toBeVisible();

  // Reload — the resolution and the still-failed film must both persist.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Unresolved metadata" }),
  ).toBeVisible();
  await expect(page.getByText("Unresolved (0)")).toBeVisible();
  await expect(page.getByText("Failed (1)")).toBeVisible();

  // The watchlist card reflects the manual match immediately.
  await page.getByRole("link", { name: "Watchlist" }).click();
  const inceptionCard = page
    .locator("a", { hasText: "Inception" })
    .filter({ hasText: "2010" });
  await expect(inceptionCard.getByText(/148 min/)).toBeVisible();
});

test("the completion summary never uses alarming red styling for unresolved-only outcomes — red is reserved for real failures", async ({
  page,
}) => {
  await page.route("**/api/metadata", async (route) => {
    const body = route.request().postDataJSON() as { title: string };
    if (body.title === "Inception") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ambiguous",
          providerId: "tmdb",
          candidates: [],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "matched",
        providerId: "tmdb",
        result: { runtimeMinutes: 104 },
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

  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Metadata update complete" });
  await expect(alert).toBeVisible();
  await expect(alert).not.toHaveClass(/text-destructive/);

  // Unresolved gets a warning/neutral treatment, not the failure color.
  await expect(alert.getByText("Review")).toHaveClass(/text-watchlist-orange/);
});

test("a failed film can be retried individually from the review screen", async ({
  page,
}) => {
  let attempt = 0;
  await page.route("**/api/metadata", async (route) => {
    const body = route.request().postDataJSON() as { title: string };
    if (body.title === "Parasite") {
      attempt++;
      if (attempt === 1) {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            status: "provider-error",
            providerId: "tmdb",
            message: "TMDB is down",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "matched",
          providerId: "tmdb",
          result: { runtimeMinutes: 132 },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "matched",
        providerId: "tmdb",
        result: { runtimeMinutes: 100 },
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
  await expect(page.getByRole("link", { name: /Needs review/ })).toBeVisible();
  await page.getByRole("link", { name: /Needs review/ }).click();

  await expect(page.getByText("Failed (1)")).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Nothing needs review")).toBeVisible();
});
