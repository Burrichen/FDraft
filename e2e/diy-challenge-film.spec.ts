import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(
  __dirname,
  "fixtures",
  "diy-challenge-watchlist.csv",
);

/**
 * See docs/updates, v1.1.1, "DIY Challenge Film" — end-to-end coverage
 * (real IndexedDB) that "Pick Your Own" works as a genuine, manually
 * selectable Challenge Film slot under "Choose My Challenge": the user
 * picks exactly one film for it, that film is never available to the
 * random draw instead (see the `reservedForDiyEntryIds` fix in
 * `local-draft-service.ts`), and the resulting draft item behaves like any
 * other Challenge Film (correct challenge name shown, normal lifecycle).
 */
test("'Pick Your Own' can be manually chosen for a challenge slot, reserves its pre-picked film from the random draw, and shows up as a normal Challenge Film afterward", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await page.getByRole("button", { name: /Baby/ }).click();

  // Move the "Challenge films" slider down to exactly 1 (default split for
  // 5 films is 2 random / 3 challenge) — Home then one ArrowRight lands
  // on 1, which drives randomCount to 4 via the linked-slider invariant.
  const challengeSlider = page.getByRole("slider", { name: "Challenge films" });
  await challengeSlider.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByText("4 random + 1 challenge = 5 films"),
  ).toBeVisible();

  await page.getByRole("radio", { name: /Choose My Challenge/ }).click();
  await page
    .getByRole("textbox", { name: "Search challenges" })
    .fill("Pick Your Own");
  await page.getByRole("button", { name: /^Pick Your Own/ }).click();
  await expect(
    page.getByText("Pick Your Own — choose 0 of 1 film"),
  ).toBeVisible();

  await page.getByRole("button", { name: /My Chosen Backup/ }).click();
  await expect(
    page.getByText("Pick Your Own — choose 1 of 1 film"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/drafts/);

  // The reserved film became the "Pick Your Own" challenge item, not a
  // random pick, and its challenge label resolves correctly.
  const diyCard = page
    .locator("li, div")
    .filter({ hasText: "My Chosen Backup" })
    .filter({ hasText: "Challenge: Pick Your Own" })
    .last();
  await expect(diyCard).toBeVisible();

  // Reload — the choice and its normal Challenge Film status persist.
  await page.reload();
  await expect(
    page
      .locator("li, div")
      .filter({ hasText: "My Chosen Backup" })
      .filter({ hasText: "Challenge: Pick Your Own" })
      .last(),
  ).toBeVisible();
});
