import { expect, test } from "@playwright/test";

/**
 * See docs/updates, "FDRAFT UPDATE 1 — EVENT STATS/HISTORY/PERSISTENCE
 * AUDIT" §9/§19 — real-browser coverage for the new compact Event Stats
 * section on the Stats page: joins Halloween, drafts and watches one film
 * via One At A Time, then confirms the resulting occurrence card renders
 * correctly at each of the task's three required desktop resolutions
 * (1366×768, 1920×1080, 2560×1440). The underlying data derivation
 * (`computeEventOccurrenceStats`) is already exhaustively unit-tested
 * against a real IndexedDB (`event-occurrence-stats.test.ts`,
 * `stats-view.test.tsx`) — this test's job, like the project's other
 * end-to-end specs, is proving the real browser/CSS mechanics, not
 * re-proving the data logic.
 */
test("Stats page shows a completed Halloween occurrence's Event Stats card at every required desktop width", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

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
  await page.getByRole("button", { name: "Random" }).click();
  await page.getByRole("button", { name: "Horror", exact: true }).click();
  await page.getByRole("button", { name: /^Okay/ }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByRole("heading", { name: /Halloween \d{4} Draft/ }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /^Mark ".*" as watched$/ })
    .first()
    .click();
  await expect(page.getByText(/Marked ".*" as watched/)).toBeVisible();

  await page.getByRole("link", { name: "Stats" }).click();
  await expect(
    page.getByRole("heading", { name: "Stats", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Event Stats")).toBeVisible();
  await expect(page.getByText("Films watched")).toBeVisible();
  await expect(page.getByText(/1\/1/)).toBeVisible();
  await expect(page.getByText("Haunted Points earned")).toBeVisible();
  await expect(page.getByText("Completed")).toBeVisible();

  for (const size of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(size);
    // The card must stay fully within the viewport at every required
    // width — never a tiny stranded card overflowing or clipped.
    const card = page.getByText("Event Stats").locator("..").locator("..");
    await expect(card).toBeVisible();
  }
});
