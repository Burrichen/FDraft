import { expect, test } from "@playwright/test";

/**
 * See docs/updates, "FDRAFT UPDATE 1 — JANUARY EVENT-OVER EXPERIENCE" —
 * the full real-browser walkthrough of January's own Event-over
 * experience, through the exact same generic global mechanism Halloween's
 * own `e2e/halloween-ending-experience.spec.ts` already exercises: joining
 * via Admin Mode's Event Testing switcher, simulating the event's own
 * natural close (25 January 00:00 – 1 February 00:00), and confirming the
 * ending modal appears GLOBALLY (no visit to the January page itself
 * needed), shows the exact required copy and exact blue button, and is
 * dismissed only by its own explicit button — never Escape.
 */

const JANUARY_MESSAGE =
  "The world brightens. The January misery is forgotten as the first sun of the year burns through the clouds. The town of FDraft forgets what that awful phrase and people begin to smile again. They can rebuild.";
const JANUARY_BUTTON = "I made it through the worst month.";

test("January: joining, simulating the event's close, and dismissing the Event-over modal", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  // Join January while its simulated date is inside the real window.
  await page.goto("/settings");
  await page.locator("#admin-mode").click();
  await expect(page.getByText("Event Testing")).toBeVisible();
  await page.selectOption("#event-date-override", "f-you-its-january");
  await page.fill("#event-date-override-manual", "2026-01-28T12:00");
  await page.reload();
  await page.getByRole("button", { name: "Opt In" }).click();
  await page.waitForTimeout(500);

  // Simulate the event's own natural close — no need to visit the January
  // page at all; every subsequent navigation is to an unrelated page,
  // proving the ending is driven from the global app shell.
  await page.goto("/settings");
  await page.fill("#event-date-override-manual", "2026-02-01T00:00");
  await expect(page.getByText(/test date active/i)).toBeVisible();

  await page.goto("/watchlist");
  await expect(page.getByText(JANUARY_MESSAGE)).toBeVisible();

  const dismiss = page.getByRole("button", { name: JANUARY_BUTTON });
  await expect(dismiss).toBeVisible();

  // Escape must never dismiss this modal — only the explicit action does.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await expect(page.getByText(JANUARY_MESSAGE)).toBeVisible();

  await dismiss.click();
  await expect(page.getByText(JANUARY_MESSAGE)).not.toBeVisible();

  // Reloading (a fresh app launch) never re-shows an already-acknowledged
  // ending for the same occurrence.
  await page.reload();
  await expect(page.getByText(JANUARY_MESSAGE)).not.toBeVisible();

  // The historical Draft/History area is still reachable — nothing about
  // the ending erased anything, and Misery Points survive.
  await page.goto("/drafts/history");
  await expect(
    page.getByRole("heading", { name: "Draft history" }),
  ).toBeVisible();

  await page.goto("/stats");
  await expect(page.getByText("Misery")).toBeVisible();
});
