import { expect, test } from "@playwright/test";

/**
 * See docs/product-spec.md, "DEFAULT START PAGE SETTING", "ROOT ROUTING",
 * "MULTIPLE LOCAL PROFILES".
 */

test("defaults to Watchlist, changing it in Settings redirects the root route, and direct links are unaffected", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();

  // Landing on "/" for a brand-new profile (no setting ever changed) opens
  // Watchlist — the required fallback.
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  expect(page.url()).toContain("/watchlist");

  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const select = page.getByLabel("Default page");
  await expect(select).toHaveValue("watchlist");

  await select.selectOption("drafts");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /draft/i })).toBeVisible();
  expect(page.url()).toContain("/drafts");
  expect(page.url()).not.toContain("/drafts/history");

  // A direct link to a specific page is never redirected, regardless of
  // the default — see "ROOT ROUTING": "Do not interfere with direct
  // links."
  await page.goto("/drafts/history");
  await expect(
    page.getByRole("heading", { name: "Draft history" }),
  ).toBeVisible();

  // The choice survives a reload of the root route itself too — it's
  // persisted on the profile, not just in-memory page state.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /draft/i })).toBeVisible();
  expect(page.url()).toContain("/drafts");
});

test("each local profile has its own independent default page", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.getByLabel("Default page").selectOption("drafts");

  // Create a second profile from the Settings page.
  await page.getByLabel("New profile name").fill("Sam");
  await page.getByRole("button", { name: "+ Create Profile" }).click();
  await expect(page.getByText('Created profile "Sam"')).toBeVisible();

  // Creating a profile doesn't switch to it — still Alex, still Drafts.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /draft/i })).toBeVisible();

  // Switch to Sam and give her a different default.
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Switch to Sam" }).click();
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByLabel("Default page")).toHaveValue("watchlist");
  await page.getByLabel("Default page").selectOption("stats");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();

  // Switching back to Alex uses HER setting again, not Sam's.
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Switch to Alex" }).click();
  // The switch itself is async (an IndexedDB write) — wait for the header
  // to actually reflect Alex before navigating, so `page.goto` doesn't
  // race ahead of it and reload while Sam is still the active pointer.
  await expect(page.getByRole("button", { name: "Profile menu" })).toHaveText(
    "A",
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /draft/i })).toBeVisible();
});
