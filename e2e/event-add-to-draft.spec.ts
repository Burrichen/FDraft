import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const FIXTURE_CSV = path.join(
  __dirname,
  "fixtures",
  "diy-challenge-watchlist.csv",
);

async function importFixtureWatchlist(page: Page) {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
}

/**
 * The Event half of Living Drafts, end to end (see docs/updates, "FDRAFT
 * v1.2.1 — LIVING DRAFTS" Part 3 §4/§5/§6/§10/§11).
 *
 * Worth a real browser because the wiring spans four layers no unit test
 * crosses at once: the Watchlist page resolving which Event Draft is
 * active and which films that Event accepts, the accented action itself,
 * the mutation storing an `event`-sourced item in the EVENT Draft rather
 * than the normal one, and the shared Undo reversing it.
 *
 * The Halloween Draft is created through One At A Time (a curated Horror
 * pick), not bulk generation: the bulk form's "Halloween-adjacent" pool
 * needs genre metadata, which nothing enriches in an offline test run —
 * the same route `halloween-one-at-a-time.spec.ts` already relies on.
 */
test("a Watchlist film can be added to the Halloween Draft, then undone", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await importFixtureWatchlist(page);

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
  await page.getByRole("button", { name: "Random" }).click();
  await page.getByRole("button", { name: "Horror", exact: true }).click();
  await page.getByRole("button", { name: /^Okay/ }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByRole("heading", { name: /Halloween \d{4} Draft/ }),
  ).toBeVisible();
  await expect(page.getByText(/0\/1 watched/)).toBeVisible();

  // On the Watchlist, films Halloween accepts now get an Event-specific
  // action alongside the normal one.
  await page.goto("/watchlist");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  const eventAdd = page
    .getByRole("button", { name: /^Add ".*" to your Halloween draft$/ })
    .first();
  await expect(eventAdd).toBeVisible();

  // The confirmation names the Event Draft, and cancelling changes nothing.
  await eventAdd.click();
  await expect(
    page.getByRole("heading", { name: "Add to Halloween Draft?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByLabel(/is already in your Halloween draft$/),
  ).toHaveCount(0);

  await eventAdd.click();
  await page.getByRole("button", { name: "Add to Draft" }).click();
  await expect(
    page.getByText(/Added ".*" to your Halloween draft/),
  ).toBeVisible();
  // Reflected immediately on the card it came from.
  await expect(
    page.getByLabel(/is already in your Halloween draft$/),
  ).toHaveCount(1);

  // The Halloween Draft holds two films now — progress counts what is in
  // it (Part 2 §8) — and the addition is reversible through the same
  // single Undo control every other mutation uses (Part 3 §11).
  await page.goto("/events/halloween");
  await expect(page.getByText(/0\/2 watched/)).toBeVisible();
  await page.getByRole("button", { name: /^Undo adding/ }).click();
  await expect(page.getByText(/Removed ".*" from your draft/)).toBeVisible();
  await expect(page.getByText(/0\/1 watched/)).toBeVisible();
});
