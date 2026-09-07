import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" §8 —
 * January has no bespoke page/creation UI; a January-tagged One At A Time
 * Draft is created through the fully generic `/drafts/new` form, which
 * becomes event-aware the moment January is the currently active event
 * (see `new-draft-form.tsx`'s `handleContinueToOneAtATime`). No category
 * step at all — Random/Choose My Own act directly on January's own
 * eligible pool.
 */

test("January: generic /drafts/new → One At A Time becomes January-aware", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  // At least one active watchlist film is needed for the generic /drafts/new
  // picker to even enable "One At A Time" (unrelated to January eligibility
  // specifically — the button's own disabling check is on raw watchlist
  // size). None of this fixture's films carry rating metadata post-import
  // (no network fetch happens in this test), so none end up January-eligible
  // either — which is fine: the point below is proving no category step and
  // no watchlist leak, not that a real eligible film exists.
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.goto("/settings");
  await page.locator("#admin-mode").click();
  await expect(page.getByText("Event Testing")).toBeVisible();
  await page.selectOption("#event-date-override", "f-you-its-january");
  await page.fill("#event-date-override-manual", "2026-01-28T12:00");
  await page.reload();
  await page.getByRole("button", { name: "Opt In" }).click();
  await page.waitForTimeout(500);

  await page.goto("/drafts/new");
  await page.getByRole("button", { name: "One At A Time" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: /One At A Time — F\* You/ }),
  ).toBeVisible();

  // No category step for January — clicking Random goes straight to a
  // candidate or the honest "nothing eligible" message (a fresh profile's
  // watchlist is empty), never a category picker.
  await page.getByRole("button", { name: "Random" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Which category should we draw from?",
    }),
  ).not.toBeVisible();
  await expect(
    page.getByText("No more eligible films are available to pick from."),
  ).toBeVisible();
});
