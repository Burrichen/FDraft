import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/product-spec.md, "WATCHED FILM UNDO". Marking a film watched
 * should fade its card and offer an Undo control instead of instantly
 * removing it, and that undo opportunity must survive navigating between
 * FDraft pages — but not a hard reload, which is where the normal,
 * persisted watched state takes over for good.
 */

async function importSampleWatchlist(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
  await page.getByRole("button", { name: "View watchlist" }).click();
  await expect(page.getByText("5 films")).toBeVisible();
}

test("marking a film watched fades it with an Undo control instead of removing it, and Undo fully reverses it", async ({
  page,
}) => {
  await importSampleWatchlist(page);

  const markButton = page
    .getByRole("button", { name: /^Mark ".*" as watched$/ })
    .first();
  const title = await markButton.getAttribute("aria-label");
  const filmTitle = title!.replace(/^Mark "/, "").replace(/" as watched$/, "");

  await markButton.click();

  // The card stays put — still on the page, not removed — with an Undo
  // control replacing the eye button. The watchlist's active count already
  // reflects the watch, even though the card is still visibly here.
  await expect(page.getByText(filmTitle).first()).toBeVisible();
  const undoButton = page.getByRole("button", {
    name: `Undo marking "${filmTitle}" as watched`,
  });
  await expect(undoButton).toBeVisible();
  await expect(page.getByText("4 films")).toBeVisible();

  await undoButton.click();

  // Fully reversed: back to a plain "Mark as watched" control, and the
  // active count is back to 5.
  await expect(
    page.getByRole("button", { name: `Mark "${filmTitle}" as watched` }),
  ).toBeVisible();
  await expect(page.getByText("5 films")).toBeVisible();
});

test("the undo opportunity survives navigating to another page and back, but not a hard reload", async ({
  page,
}) => {
  await importSampleWatchlist(page);

  const markButton = page
    .getByRole("button", { name: /^Mark ".*" as watched$/ })
    .first();
  const title = await markButton.getAttribute("aria-label");
  const filmTitle = title!.replace(/^Mark "/, "").replace(/" as watched$/, "");
  await markButton.click();

  const undoButtonName = `Undo marking "${filmTitle}" as watched`;
  await expect(
    page.getByRole("button", { name: undoButtonName }),
  ).toBeVisible();

  // Navigate away and back — the undo opportunity, and the faded card, must
  // still be here (see docs/product-spec.md, "WATCHED FILM UNDO", "UNDO
  // WINDOW": "Navigate between FDraft pages -> Undo still available.").
  await page.getByRole("link", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: undoButtonName }),
  ).toBeVisible();

  // A hard reload, though, is where the undo window genuinely closes — the
  // normal persisted watched state applies from here on.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await expect(page.getByText("4 films")).toBeVisible();
  await expect(
    page.getByRole("button", { name: undoButtonName }),
  ).not.toBeVisible();
  await expect(page.getByText(filmTitle)).not.toBeVisible();
});

test("undoing the film that completed a draft's last remaining slot reverses the early-archive too, and the draft stays reachable after navigating away and back", async ({
  page,
}) => {
  await importSampleWatchlist(page);

  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await page.getByRole("button", { name: /^Baby/ }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Baby draft/ })).toBeVisible();

  // Mark all 5 films in this Baby draft watched, completing it early.
  for (let i = 0; i < 5; i++) {
    await page
      .getByRole("button", { name: /^Mark ".*" as watched$/ })
      .first()
      .click();
  }
  await expect(page.getByText(/5\/5 watched/)).toBeVisible();

  // The final film's card must still be visible with its Undo control —
  // completing the draft must not make the last watch action impossible to
  // reverse (see docs/product-spec.md, "WATCHED FILM UNDO", "COMPLETED/
  // FULLY WATCHED DRAFT").
  const undoButtons = page.getByRole("button", { name: /^Undo marking ".*"/ });
  await expect(undoButtons).toHaveCount(5);

  // Navigate away and back — the now-archived draft must still be reachable
  // here, not replaced by "No active draft".
  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await page.getByRole("link", { name: "Drafts" }).click();
  await expect(page.getByRole("heading", { name: /Baby draft/ })).toBeVisible();
  await expect(page.getByText(/5\/5 watched/)).toBeVisible();

  // Undo the LAST one marked (DOM order follows the draft's fixed
  // orderIndex, and marking-watched never reorders a card — so the film at
  // the end is the one whose action actually completed and archived the
  // draft). The draft must become active again, with that film back among
  // the films still to watch.
  await undoButtons.last().click();
  await expect(page.getByText(/4\/5 watched/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Baby draft/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Mark ".*" as watched$/ }),
  ).toHaveCount(1);

  // And that reversal survives a refresh too — the draft is genuinely
  // active again in the database, not just visually patched up.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Baby draft/ })).toBeVisible();
  await expect(page.getByText(/4\/5 watched/)).toBeVisible();
});
