import { expect, test } from "@playwright/test";

/**
 * See docs/updates, "EVENT SYSTEM — EVENT-OVER EXPERIENCE" — the full
 * real-browser walkthrough of Halloween's Event-over experience: joining
 * via Admin Mode's Event Testing switcher, simulating the event's own
 * natural close (30 September 19:00 – 1 November 00:00), and confirming
 * the goodbye modal appears GLOBALLY (no visit to the Halloween page
 * itself needed), shows the exact required copy, and is dismissed only by
 * its own explicit button — never Escape.
 */

const MAIN_MESSAGE =
  "The dark cloud over FDraft finally parts, leaving a brisk chill in the air. It's passed, but you get the feeling it'll be back again soon.";

test("Halloween: joining, simulating the event's close, and dismissing the Event-over modal", async ({
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

  // Simulate the event's own natural close — no need to visit the
  // Halloween page at all; every subsequent navigation is to an unrelated
  // page, proving the ending is driven from the global app shell.
  await page.goto("/settings");
  await page.fill("#event-date-override-manual", "2026-11-01T00:00");
  await expect(page.getByText(/test date active/i)).toBeVisible();

  await page.goto("/watchlist");
  await expect(page.getByText(MAIN_MESSAGE)).toBeVisible();
  await expect(
    page.getByText("You survived the 1st annual FDraft Halloween event."),
  ).toBeVisible();

  const dismiss = page.getByRole("button", { name: "See you next year." });
  await expect(dismiss).toBeVisible();

  // Escape must never dismiss this modal — only the explicit action does.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await expect(page.getByText(MAIN_MESSAGE)).toBeVisible();

  await dismiss.click();
  await expect(page.getByText(MAIN_MESSAGE)).not.toBeVisible();

  // Reloading (a fresh app launch) never re-shows an already-acknowledged
  // ending for the same occurrence.
  await page.reload();
  await expect(page.getByText(MAIN_MESSAGE)).not.toBeVisible();

  // The historical Draft/History area is still reachable — nothing about
  // the ending erased anything.
  await page.goto("/drafts/history");
  await expect(
    page.getByRole("heading", { name: "Draft history" }),
  ).toBeVisible();
});
