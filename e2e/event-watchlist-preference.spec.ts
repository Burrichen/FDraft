import { expect, test, type Page } from "@playwright/test";

/**
 * See docs/updates, "FDRAFT UPDATE 1 — EVENT WATCHLIST PREFERENCE CLEANUP"
 * — the real-browser half of that phase's test list: Halloween-adjacent is
 * gone from every NEW Draft creation surface (Horror/Kitsch are the only
 * two categories left), and the shared "Prefer items from my Watchlist"
 * checkbox appears, with identical wording, across every non-January Event
 * Draft creation flow — Halloween's fixed automatic builder and both One
 * At A Time sub-modes (Random and Choose My Own).
 *
 * The actual draw/ordering mechanics (watchlist-intersection-first,
 * fallback to the full pool, never failing the Draft, duplicate
 * prevention) are covered exhaustively at the unit/integration level in
 * `halloween-draft-service.test.ts`, `prefer-watchlist-draw.test.ts` and
 * `event-category-film-browser.test.tsx`; this spec is about the real UI
 * actually offering the control in the right places, with the right
 * wording.
 */

async function createProfile(page: Page) {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
}

async function joinHalloween(page: Page) {
  await page.goto("/settings");
  await page.locator("#admin-mode").click();
  await expect(page.getByText("Event Testing")).toBeVisible();
  await page.selectOption("#event-date-override", "halloween");
  await page.fill("#event-date-override-manual", "2026-10-15T12:00");
  await page.reload();
  await page.getByRole("button", { name: "Let me in." }).click();
  await page.waitForTimeout(500);
}

test("Halloween: the fixed builder offers only Horror/Kitsch, summing to the difficulty, with Prefer items from my Watchlist beneath — no Halloween-Adjacent anywhere", async ({
  page,
}) => {
  await createProfile(page);
  await joinHalloween(page);

  await page.goto("/events/halloween");
  await page.getByRole("button", { name: "Create Halloween Draft" }).click();
  await page.getByRole("button", { name: "Medium 10 films" }).click();

  const horror = page.getByRole("slider", { name: "Horror films" });
  const kitsch = page.getByRole("slider", { name: "Kitsch films" });
  await expect(horror).toBeVisible();
  await expect(kitsch).toBeVisible();

  // No third slider, and no visible mention of Halloween-Adjacent
  // anywhere in the create form.
  await expect(page.getByRole("slider", { name: /adjacent/i })).toHaveCount(0);
  await expect(page.getByText(/halloween.?adjacent/i)).toHaveCount(0);

  await expect(page.getByText(/always adds up to/)).toBeVisible();

  const preferWatchlist = page.getByLabel("Prefer items from my Watchlist");
  await expect(preferWatchlist).toBeVisible();
  await expect(preferWatchlist).toBeChecked();
  await preferWatchlist.uncheck();
  await expect(preferWatchlist).not.toBeChecked();

  // Dragging one slider keeps the pair's total fixed.
  const totalBefore = await readSliderTotal(page);
  await horror.focus();
  for (let press = 0; press < 3; press++) {
    await page.keyboard.press("ArrowRight");
  }
  expect(await readSliderTotal(page)).toBe(totalBefore);
});

async function readSliderTotal(page: Page): Promise<number> {
  const values = await page
    .getByRole("slider")
    .evaluateAll((nodes) =>
      nodes.map((node) => Number(node.getAttribute("aria-valuenow") ?? "0")),
    );
  return values.reduce((sum, value) => sum + value, 0);
}

test("Halloween: One At A Time offers Prefer items from my Watchlist before BOTH Random and Choose My Own category selection", async ({
  page,
}) => {
  await createProfile(page);
  await joinHalloween(page);

  await page.goto("/events/halloween");
  await page.getByRole("button", { name: "Create Halloween Draft" }).click();
  await page.getByRole("button", { name: "One At A Time" }).click();

  // Random.
  await page.getByRole("button", { name: "Random" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Which category should we draw from?",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Prefer items from my Watchlist")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  // Choose My Own.
  await page.getByRole("button", { name: "Choose My Own" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Which category do you want to choose from?",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Prefer items from my Watchlist")).toBeVisible();
});

test("January: never shows a Prefer items from my Watchlist control — it has no builder at all", async ({
  page,
}) => {
  await createProfile(page);

  await page.goto("/settings");
  await page.locator("#admin-mode").click();
  await expect(page.getByText("Event Testing")).toBeVisible();
  await page.selectOption("#event-date-override", "f-you-its-january");
  await page.fill("#event-date-override-manual", "2027-01-28T12:00");
  await page.reload();
  const intro = page.getByRole("alertdialog", {
    name: /F\* You, It's January!/,
  });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: "Opt In" }).click();
  await expect(intro).not.toBeVisible();

  await expect(page.getByText(/prefer/i)).toHaveCount(0);
  await expect(page.getByLabel("Prefer items from my Watchlist")).toHaveCount(
    0,
  );
});
