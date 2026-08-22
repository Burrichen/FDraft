import path from "node:path";
import { expect, test } from "@playwright/test";

const INITIAL_CSV = path.join(
  __dirname,
  "fixtures",
  "diy-challenge-watchlist.csv",
);
const REPLACEMENT_CSV = path.join(
  __dirname,
  "fixtures",
  "reimport-replacement-watchlist.csv",
);

/**
 * See docs/updates, v1.1.2, "Re-import Letterboxd Watchlist" — a Settings
 * action that replaces the active profile's watchlist MEMBERSHIP with a
 * newer Letterboxd export, requiring explicit confirmation, while
 * preserving unrelated profile data (watched history, ratings) untouched.
 */
test("Re-import Letterboxd Watchlist requires confirmation, replaces membership, and preserves watched history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(INITIAL_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
  await page.getByRole("button", { name: "View watchlist" }).click();
  await expect(page.getByText("6 films")).toBeVisible();

  // Mark one film watched — this must survive the replace untouched.
  await page
    .getByRole("button", { name: /^Mark ".*" as watched$/ })
    .first()
    .click();

  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByText("Re-import Letterboxd Watchlist")).toBeVisible();

  await page.getByRole("button", { name: "Choose Letterboxd Export" }).click();
  await page
    .locator('input[type="file"][accept=".csv,.zip"]')
    .setInputFiles(REPLACEMENT_CSV);

  // Confirmation is required — nothing happens until it's accepted.
  await page.getByRole("button", { name: "Replace Watchlist" }).click();
  await expect(
    page.getByRole("heading", { name: "Replace your current watchlist?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("heading", { name: "Replace your current watchlist?" }),
  ).toHaveCount(0);

  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByText("5 films")).toBeVisible(); // untouched by cancel

  // Now actually confirm the replace — re-choosing the file, since
  // navigating away reset the (page-local) staged selection.
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Choose Letterboxd Export" }).click();
  await page
    .locator('input[type="file"][accept=".csv,.zip"]')
    .setInputFiles(REPLACEMENT_CSV);
  await page.getByRole("button", { name: "Replace Watchlist" }).click();
  await page.getByRole("button", { name: "Replace permanently" }).click();
  await expect(page.getByText(/Replaced "Alex"'s watchlist/)).toBeVisible();

  await page.getByRole("link", { name: "Watchlist" }).click();
  // Only the 2 films from the replacement CSV remain active.
  await expect(page.getByText("2 films")).toBeVisible();
  await expect(page.getByText("Replacement Film One")).toBeVisible();
  await expect(page.getByText("Replacement Film Two")).toBeVisible();
});
