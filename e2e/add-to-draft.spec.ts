import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const FIXTURE_CSV = path.join(
  __dirname,
  "fixtures",
  "diy-challenge-watchlist.csv",
);

async function createProfile(page: Page, name: string) {
  await page.getByLabel("Profile name").fill(name);
  await page.getByRole("button", { name: "Create Profile" }).click();
}

async function importFixtureWatchlist(page: Page) {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
}

async function createBabyDraft(page: Page) {
  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await page.getByRole("button", { name: /^Baby/ }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("heading", { name: /Baby draft/i }),
  ).toBeVisible();
}

/**
 * The Watchlist card's "Add to Draft" action, end to end (see docs/updates,
 * "MANUAL 'ADD TO DRAFT' ACTION" and "FDRAFT v1.2.1 — LIVING DRAFTS" Part
 * 2 §1/§2/§4/§5).
 *
 * Its real job is the page WIRING that no unit test reaches: the control is
 * only enabled for entries in the canonical manual-selection pool, resolved
 * by the page itself. If that resolution were wrong — an empty set, the
 * wrong ids — every card would silently render the "can't add this" state
 * and the action would be unreachable, with all of its own unit tests still
 * passing.
 */
test("adding a leftover watchlist film to the active draft grows the draft, and Undo takes it back out", async ({
  page,
}) => {
  await page.goto("/");
  await createProfile(page, "Alex");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await importFixtureWatchlist(page);

  // A Baby draft takes five of the six imported films, leaving exactly one
  // film that is eligible but not yet drafted — the case this action is
  // for.
  await createBabyDraft(page);
  await expect(page.getByText(/0\/5 watched/)).toBeVisible();

  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  // Five cards say "in draft"; the one leftover offers a live Add button.
  await expect(page.getByLabel(/is already in your active draft$/)).toHaveCount(
    5,
  );
  const addButton = page.getByRole("button", {
    name: /^Add ".*" to your active draft$/,
  });
  await expect(addButton).toHaveCount(1);
  await addButton.click();

  // Nothing changes until the confirmation is accepted.
  await expect(
    page.getByRole("heading", { name: "Add to Draft?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel(/is already in your active draft$/)).toHaveCount(
    5,
  );

  await addButton.click();
  await page.getByRole("button", { name: "Add to Draft" }).click();
  await expect(page.getByText(/Added ".*" to your active draft/)).toBeVisible();
  // Reflected immediately, without a reload: six cards now read "in draft"
  // and nothing is left to add.
  await expect(page.getByLabel(/is already in your active draft$/)).toHaveCount(
    6,
  );
  await expect(
    page.getByRole("button", { name: /^Add ".*" to your active draft$/ }),
  ).toHaveCount(0);

  // The draft itself is a six-film draft now — progress counts what is in
  // it, not what its difficulty asked for (§8).
  await page.getByRole("link", { name: "Drafts" }).click();
  await expect(page.getByText(/0\/6 watched/)).toBeVisible();
  await expect(page.getByText(/6 films ·/)).toBeVisible();

  // And the page's one Undo control takes that addition back out (§5/§6).
  await page.getByRole("button", { name: /^Undo adding/ }).click();
  await expect(page.getByText(/Removed ".*" from your draft/)).toBeVisible();
  await expect(page.getByText(/0\/5 watched/)).toBeVisible();
  // Nothing left to undo, so the control is gone rather than dead.
  await expect(
    page.getByRole("button", { name: /^Undo last change$/ }),
  ).toHaveCount(0);
});

test("with no active draft, the same action starts one built around the chosen film", async ({
  page,
}) => {
  await page.goto("/");
  await createProfile(page, "Alex");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await importFixtureWatchlist(page);
  await page.getByRole("button", { name: "View watchlist" }).click();
  await expect(page.getByText("6 films")).toBeVisible();

  // No draft exists, so every card offers to start one instead.
  await page
    .getByRole("button", { name: 'Start a new draft with "My Chosen Backup"' })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start a draft with this film?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start a draft" }).click();

  // The ordinary create flow, with the chosen film named and carried.
  await expect(
    page.getByRole("heading", { name: "Start a draft" }),
  ).toBeVisible();
  await expect(page.getByText(/Starting with/)).toBeVisible();
  await expect(page.getByText("My Chosen Backup")).toBeVisible();

  await page.getByRole("button", { name: /^Baby/ }).click();
  await page.getByRole("button", { name: "Create draft" }).click();

  // A normal five-film Baby draft that is guaranteed to contain it.
  await expect(
    page.getByRole("heading", { name: /Baby draft/i }),
  ).toBeVisible();
  await expect(page.getByText(/0\/5 watched/)).toBeVisible();
  await expect(page.getByText("My Chosen Backup")).toBeVisible();
});
