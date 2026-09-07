import { expect, test } from "@playwright/test";

/**
 * See docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" — the
 * first real end-to-end walkthrough of Christmas gameplay (previously just
 * currency config with no page/nav tab at all): opting in via Admin Mode's
 * Event Testing switcher, reaching the new `/events/christmas` page, and
 * creating a real One At A Time Draft via the Classic category — proving
 * the same generic category-based code Halloween uses, not a duplicate.
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
