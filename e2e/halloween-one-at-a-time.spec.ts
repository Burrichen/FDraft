import { expect, test } from "@playwright/test";

/**
 * See docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" — a
 * full real-browser walkthrough of Halloween's new One At A Time option:
 * joining, choosing "One At A Time" alongside the existing numeric
 * difficulties, picking Random from the Horror category, confirming it,
 * and finishing with "Done" to create a real, correctly-tagged Draft.
 */

test("Halloween: One At A Time — Random Horror, Okay, Done", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  // Join Halloween while its simulated date is inside the real window.
  await page.goto("/settings");
  await page.locator("#admin-mode").click();
  await expect(page.getByText("Event Testing")).toBeVisible();
  await page.selectOption("#event-date-override", "halloween");
  await page.fill("#event-date-override-manual", "2026-10-15T12:00");
  await page.reload();
  await page.getByRole("button", { name: "Let me in." }).click();
  await page.waitForTimeout(500);

  await page.goto("/events/halloween");
  await page.getByRole("button", { name: "Create Halloween Draft" }).click();
  await page.getByRole("button", { name: "One At A Time" }).click();

  await expect(
    page.getByRole("heading", { name: "One At A Time — Halloween" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Random" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Which category should we draw from?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Horror", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Random pick" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Okay/ }).click();

  await expect(
    page.getByRole("heading", { name: "Your draft so far (1)" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();

  // Halloween's own page shows the newly created Draft in place — never a
  // navigation to `/drafts`, matching the existing bulk-generation flow's
  // own convention.
  await expect(page).toHaveURL(/\/events\/halloween$/);
  await expect(
    page.getByRole("heading", { name: /Halloween \d{4} Draft/ }),
  ).toBeVisible();
  await expect(page.getByText(/Horror · Random/)).toBeVisible();
});
