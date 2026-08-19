import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(
  __dirname,
  "fixtures",
  "diy-recommendations-watchlist.csv",
);

/**
 * See docs/updates, v1.1.2, "DIY Draft card spacing" — the Build Your Own
 * Draft grid's cards must never touch or overlap one another, at common
 * and narrower widths alike, without resorting to one-off margin hacks
 * (the grid's own `gap-3` plus each card filling its own cell correctly is
 * the fix — see `DiyFilmCard`'s `w-full` and the grid `<li>`'s `min-w-0`).
 */
for (const width of [1280, 1024, 768, 375]) {
  test(`Build Your Own Draft grid cards never overlap at ${width}px`, async ({
    page,
  }) => {
    await page.route("**/api/metadata", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "matched",
          providerId: "tmdb",
          result: {
            runtimeMinutes: 90,
            averageRating: 4.0,
            releaseDate: "2015-01-01",
            releaseStatus: "Released",
            posterUrl: null,
          },
        }),
      });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByLabel("Profile name").fill("Alex");
    await page.getByRole("button", { name: "Create Profile" }).click();
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await page
      .getByLabel(/Watchlist CSV or export ZIP/i)
      .setInputFiles(FIXTURE_CSV);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("Import complete")).toBeVisible();

    await page.goto("/drafts/new");
    await page.getByRole("button", { name: /Baby/ }).click();
    await page.getByRole("radio", { name: /Build My Own Draft/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Build your own draft" }),
    ).toBeVisible();

    const { count, minGap } = await page.evaluate(() => {
      const grid = document.querySelector(
        'ul[aria-label="Eligible films"]',
      ) as HTMLElement;
      const rects = Array.from(grid.children).map((li) =>
        li.getBoundingClientRect(),
      );
      let min = Infinity;
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const xOverlap = a.left < b.right && b.left < a.right;
          const yOverlap = a.top < b.bottom && b.top < a.bottom;
          if (xOverlap && yOverlap) {
            min = Math.min(min, 0);
            continue;
          }
          // Distance between the two rects along whichever axis separates them.
          const xGap = a.right <= b.left ? b.left - a.right : b.right - a.left;
          const yGap = a.bottom <= b.top ? b.top - a.bottom : b.bottom - a.top;
          if (xOverlap) min = Math.min(min, Math.abs(yGap));
          else if (yOverlap) min = Math.min(min, Math.abs(xGap));
        }
      }
      return { count: rects.length, minGap: min };
    });

    expect(count).toBeGreaterThan(0);
    // A real, visible gap — not just "not literally touching" (0px).
    expect(minGap).toBeGreaterThanOrEqual(8);
  });
}
