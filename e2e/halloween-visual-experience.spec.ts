import { expect, test } from "@playwright/test";

/**
 * See docs/updates, "PROMPT 20 — HIGH-EFFORT HALLOWEEN UI + APPROVED
 * EASTER EGGS" — the one end-to-end walkthrough covering the whole
 * Halloween presentation: Admin Mode's Event Testing simulated date,
 * joining, the Kitsch Halloween theme, the nav tab's own active accent,
 * all three approved easter eggs, and the "Haunted" jumpscare's full
 * lifecycle (armed warning → skull overlay → clean return, no navigation,
 * no persisted state).
 */
test("Halloween: opt-in, theme, easter eggs, and the Haunted jumpscare", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alexandria the Great");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  // Simulate a date inside Halloween's real window via Admin Mode's Event
  // Testing switcher (see docs/updates, "PROMPT 17").
  await page.goto("/settings");
  await page.locator("#admin-mode").click();
  await expect(page.getByText("Event Testing")).toBeVisible();
  await page.selectOption("#event-date-override", "halloween");
  await page.fill("#event-date-override-manual", "2026-10-15T12:00");

  // The nav bar reads event settings independently of the Settings page,
  // so a reload is what makes both reflect the newly-armed simulated date.
  await page.reload();
  const joinButton = page.getByRole("button", {
    name: "Let me in.",
  });
  await expect(joinButton).toBeVisible();
  await joinButton.click();

  // Joining navigates straight to the Halloween page; reload once more so
  // the nav bar's own independent event-settings fetch picks up the join.
  await page.waitForTimeout(500);
  await page.reload();

  const halloweenTab = page.getByRole("link", { name: /halloween/i });
  await expect(halloweenTab).toBeVisible();
  await halloweenTab.click();
  await expect(page.getByRole("heading", { name: "Halloween" })).toBeVisible();
  await page.screenshot({
    path: "test-results/halloween-event-page.png",
    fullPage: true,
  });

  // The "No Halloween Draft yet" step (see docs/updates, "HALLOWEEN PAGE
  // REBUILD" §4/§5) comes up first; clicking its Create button reveals the
  // actual difficulty/pool controls (Prompt 19) in place, still under the
  // new theme.
  await expect(page.getByText("No Halloween Draft yet.")).toBeVisible();
  await page.getByRole("button", { name: "Create Halloween Draft" }).click();
  for (const label of ["Baby", "Easy", "Medium", "Hard", "Hardcore"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  // Gravestone: stays non-spoiler for the first two clicks, reveals the
  // profile's display name on the third.
  const gravestone = page.getByRole("button", { name: "Old gravestone" });
  await expect(gravestone).toBeVisible();
  await gravestone.click();
  await expect(
    page.getByRole("button", { name: "Old gravestone" }),
  ).toBeVisible();
  await gravestone.click();
  await expect(
    page.getByRole("button", { name: "Old gravestone" }),
  ).toBeVisible();
  await gravestone.click();
  await expect(
    page.getByRole("button", { name: "Alexandria the Great" }),
  ).toBeVisible();

  // Pumpkin: advances one state per click, persists across a reload.
  const pumpkinButton = page.getByRole("button", {
    name: /pumpkin: uncarved/i,
  });
  await expect(pumpkinButton).toBeVisible();
  await pumpkinButton.click();
  await expect(
    page.getByRole("button", { name: /pumpkin: carved/i }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /pumpkin: carved/i }),
  ).toBeVisible();

  // Candy bowl: decrements per click, never persists (a fresh mount is
  // full again — verified separately at the unit level).
  const candyButtons = page.getByRole("button", {
    name: "Take a piece of candy",
  });
  const candyCountBefore = await candyButtons.count();
  await candyButtons.first().click();
  await expect(
    page.getByRole("button", { name: "Take a piece of candy" }),
  ).toHaveCount(candyCountBefore - 1);

  // Haunted: armed warning, then the full-screen skull jumpscare, then a
  // clean return to exactly the same Settings page — no navigation, no
  // reload, nothing persisted.
  await page.goto("/settings");
  const hauntedButton = page.getByRole("button", { name: /haunted/i });
  await expect(hauntedButton).toBeVisible();

  await hauntedButton.click();
  await expect(
    page.getByText("There is no going back. Don't do it."),
  ).toBeVisible();
  await expect(page.getByRole("alertdialog")).not.toBeVisible();

  await hauntedButton.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.waitForTimeout(400); // let the fade-in finish before the screenshot
  await page.screenshot({ path: "test-results/halloween-jumpscare.png" });
  await expect(page.getByRole("alertdialog")).not.toBeVisible({
    timeout: 5000,
  });

  // Settings is exactly where it was — same page, still on the Haunted
  // section, now exhausted for the session.
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(hauntedButton).toBeDisabled();
});

/**
 * See docs/updates, "HALLOWEEN PAGE REBUILD" — the Halloween page/nav
 * exist purely from being JOINED, with no dependency on how the profile
 * arrived there: a full page refresh, or a direct navigation straight to
 * `/events/halloween` (bookmarked, typed, or a fresh tab) must land on
 * exactly the same page with no client-side redirect elsewhere.
 */
test("Halloween: joined page survives a refresh and a direct route reload, with no redirect", async ({
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
  await page.waitForURL(/events\/halloween/);
  await expect(page.getByRole("heading", { name: "Halloween" })).toBeVisible();

  // A plain refresh keeps the profile on the same joined Halloween page —
  // never bounced back to Watchlist or anywhere else.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Halloween" })).toBeVisible();
  expect(page.url()).toContain("/events/halloween");
  await expect(
    page.getByRole("button", { name: "Create Halloween Draft" }),
  ).toBeVisible();

  // Navigate away, then straight back via a direct URL (simulating a
  // bookmark/typed address) in a brand-new navigation, not a client-side
  // link click — still the same joined page, no redirect.
  await page.goto("/watchlist");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await page.goto("/events/halloween");
  await expect(page.getByRole("heading", { name: "Halloween" })).toBeVisible();
  expect(page.url()).toContain("/events/halloween");
  await expect(
    page.getByRole("button", { name: "Create Halloween Draft" }),
  ).toBeVisible();
  // The nav tab reflects the join too, from a route that never went
  // through the join flow itself.
  await expect(page.getByRole("link", { name: /halloween/i })).toBeVisible();
});
