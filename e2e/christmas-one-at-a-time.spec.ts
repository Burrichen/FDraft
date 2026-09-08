import { expect, test } from "@playwright/test";

/**
 * See docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" — the
 * first real end-to-end walkthrough of Christmas gameplay (previously just
 * currency config with no page/nav tab at all): opting in via Admin Mode's
 * Event Testing switcher, reaching the new `/events/christmas` page, and
 * creating a real One At A Time Draft via the Classic category — proving
 * the same generic category-based code Halloween uses, not a duplicate.
 *
 * Updated for docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT
 * DIFFICULTIES + VISUAL POLISH": One At A Time is now one difficulty among
 * the shared set rather than Christmas's only creation mode, so this
 * journey goes through the difficulty picker on the way.
 */

test("Christmas: opt-in, One At A Time — Random Classic, Okay, Done", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  await page.goto("/settings");
  await page.locator("#admin-mode").click();
  await expect(page.getByText("Event Testing")).toBeVisible();
  await page.selectOption("#event-date-override", "christmas");
  await page.fill("#event-date-override-manual", "2026-12-15T12:00");
  await page.reload();
  await page.getByRole("button", { name: "Opt In" }).click();
  await page.waitForTimeout(500);

  await page.goto("/events/christmas");
  await expect(
    page.getByRole("heading", { name: "Christmas", exact: true }),
  ).toBeVisible();

  // Christmas now uses the same two-step disclosure and shared difficulty
  // picker as Halloween (see docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS
  // DRAFT DIFFICULTIES + VISUAL POLISH" §1/§7), so One At A Time is
  // reached by choosing that difficulty rather than being the only option.
  await page.getByRole("button", { name: "Create Christmas Draft" }).click();
  await page.getByRole("button", { name: /One At A Time/ }).click();

  await page.getByRole("button", { name: "Random" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Which category should we draw from?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Classic", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Random pick" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Okay/ }).click();

  await expect(
    page.getByRole("heading", { name: "Your draft so far (1)" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();

  await expect(page).toHaveURL(/\/events\/christmas$/);
  await expect(
    page.getByRole("heading", { name: /Christmas \d{4} Draft/ }),
  ).toBeVisible();
  await expect(page.getByText(/Classic · Random/)).toBeVisible();
});
