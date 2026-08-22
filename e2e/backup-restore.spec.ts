import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/product-spec.md, "TESTING" — Prompt 9.5C: "Create a test
 * similar to: Create profile -> import Letterboxd data -> create draft ->
 * mark films watched -> ... -> export backup -> clear local database ->
 * import backup -> verify entire state restored. This should be a
 * high-priority integration/E2E test."
 *
 * Postmortem responses/challenge attempts/selection-weight adjustments are
 * deliberately NOT exercised here — triggering them for real requires a
 * draft to actually expire, which means manipulating wall-clock time
 * mid-test. That full relational chain (postmortem response ->
 * selection-weight adjustment -> preserved through export/import/id-remap)
 * is exhaustively covered against a real IndexedDB in
 * `src/infrastructure/local-db/backup-restore-repository.test.ts`; this
 * test's job is different — proving the actual browser mechanics (a real
 * file download, a real file re-upload, a real full local-data wipe) work
 * end-to-end, which no unit test can exercise.
 */
async function createProfile(page: Page, name: string) {
  await page.getByLabel("Profile name").fill(name);
  await page.getByRole("button", { name: "Create Profile" }).click();
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test("full lifecycle: import, draft, watch, export, wipe, import, verify restored", async ({
  page,
}) => {
  await page.goto("/");
  await createProfile(page, "Alex");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  // --- Import a Letterboxd watchlist ---
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
  await page.getByRole("button", { name: "View watchlist" }).click();
  await expect(page.getByText("5 films")).toBeVisible();

  // --- Create a draft and mark one film watched ---
  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await page.getByRole("button", { name: /^Baby/ }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: /Baby draft/ })).toBeVisible();
  await page
    .getByRole("button", { name: /^Mark ".*" as watched$/ })
    .first()
    .click();
  await expect(page.getByText(/1\/5 watched/)).toBeVisible();

  // --- Export a backup ---
  await openSettings(page);
  await expect(page.getByText("Never")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export FDraft Backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^My-FDraft-Alex-\d{4}-\d{2}-\d{2}\.fdraft$/,
  );
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  await expect(page.getByText("Never")).not.toBeVisible();

  // --- Wipe all local data (simulates a fresh device/reinstall) ---
  await page.evaluate(() => {
    window.localStorage.clear();
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("fdraft");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
  // `page.goto("/")` rather than `page.reload()` — reload() re-requests
  // whichever URL is currently loaded (`/settings`), and only the home
  // route's first-run flow navigates to `/watchlist` after creating a
  // profile (see `first-run.spec.ts`).
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to FDraft" }),
  ).toBeVisible();

  // A throwaway placeholder profile — Settings requires an active profile
  // to render at all; the RESTORED profile is created fresh by the import
  // below, exactly as "Import as New Profile" is designed to do.
  await createProfile(page, "Temporary");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  // --- Import the backup back in ---
  await openSettings(page);
  await page.getByRole("button", { name: "Import FDraft Backup" }).click();
  await page
    .locator('input[type="file"][accept*=".fdraft"]')
    .setInputFiles(backupPath!);
  await expect(page.getByText("FDraft Backup Found")).toBeVisible();
  await expect(page.getByText("Alex")).toBeVisible();
  await page
    .getByRole("button", { name: "Import as New Profile (Recommended)" })
    .click();
  await expect(page.getByText(/Imported as a new profile/)).toBeVisible();

  // --- Switch to the restored profile and verify everything came back ---
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Switch to Alex" }).click();
  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  // 4, not 5 — the one film already marked watched before export drops out
  // of the active watchlist view, exactly as it did before the wipe.
  await expect(page.getByText("4 films")).toBeVisible();

  await page.getByRole("link", { name: "Drafts" }).click();
  await expect(page.getByRole("heading", { name: /Baby draft/ })).toBeVisible();
  await expect(page.getByText(/1\/5 watched/)).toBeVisible();
});

test("replacing the active profile requires confirmation, downloads a safety backup, and restores the same data", async ({
  page,
}) => {
  await page.goto("/");
  await createProfile(page, "Alex");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
  await page.getByRole("button", { name: "View watchlist" }).click();
  await expect(page.getByText("5 films")).toBeVisible();
  await page
    .getByRole("button", { name: /^Mark ".*" as watched$/ })
    .first()
    .click();
  await expect(page.getByText("Marked")).toBeVisible();
  // The watchlist count only refreshes on a fresh load of the page, not
  // live in place — navigate away and back to see the up-to-date count.
  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByText("4 films")).toBeVisible();

  await openSettings(page);
  const exportDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export FDraft Backup" }).click();
  const backupPath = await (await exportDownloadPromise).path();
  expect(backupPath).not.toBeNull();

  await page.getByRole("button", { name: "Import FDraft Backup" }).click();
  await page
    .locator('input[type="file"][accept*=".fdraft"]')
    .setInputFiles(backupPath!);
  await expect(page.getByText("FDraft Backup Found")).toBeVisible();

  await page.getByRole("button", { name: "Replace Existing Profile" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(/Replace "Alex" with this backup/),
  ).toBeVisible();

  const safetyDownloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Replace permanently" }).click();
  const safetyDownload = await safetyDownloadPromise;
  expect(safetyDownload.suggestedFilename()).toMatch(
    /^My-FDraft-Safety-Alex-\d{4}-\d{2}-\d{2}\.fdraft$/,
  );
  await expect(page.getByText(/Replaced your active profile/)).toBeVisible();

  // Same profile slot, same data restored — not duplicated into a second profile.
  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByText("4 films")).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole("list").getByText("Alex")).toHaveCount(1);
});

test("backup export and import both work with the browser fully offline", async ({
  page,
}) => {
  await page.goto("/");
  await createProfile(page, "Alex");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  // Warm-up pass (online) — see offline-core.spec.ts: the client router
  // fetches a small RSC payload the first time a route is visited in this
  // tab, which is a framework/tooling detail, not a real offline-mode
  // failure. Visiting Settings once now means the real, offline pass below
  // never needs a fresh navigation.
  await openSettings(page);
  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  await page.context().setOffline(true);

  await openSettings(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export FDraft Backup" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();

  await page.getByRole("button", { name: "Import FDraft Backup" }).click();
  await page
    .locator('input[type="file"][accept*=".fdraft"]')
    .setInputFiles(backupPath!);
  await expect(page.getByText("FDraft Backup Found")).toBeVisible();
  await page
    .getByRole("button", { name: "Import as New Profile (Recommended)" })
    .click();
  await expect(page.getByText(/Imported as a new profile/)).toBeVisible();
});

test("importing a corrupt or malformed backup shows a useful error and leaves existing data untouched", async ({
  page,
}) => {
  await page.goto("/");
  await createProfile(page, "Alex");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();
  await page.getByRole("button", { name: "View watchlist" }).click();
  await expect(page.getByText("5 films")).toBeVisible();

  const malformedPath = test.info().outputPath("not-a-real-backup.fdraft");
  await writeFile(malformedPath, "{ this is not valid JSON at all");

  await openSettings(page);
  await page.getByRole("button", { name: "Import FDraft Backup" }).click();
  await page
    .locator('input[type="file"][accept*=".fdraft"]')
    .setInputFiles(malformedPath);

  // A useful, specific error — never a crash, never a blank screen.
  await expect(page.getByText(/valid JSON/i)).toBeVisible();
  await expect(page.getByText(/FDraft Backup Found/)).toHaveCount(0);

  // The existing profile's data must be completely untouched.
  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page.getByText("5 films")).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole("list").getByText("Alex")).toHaveCount(1);
});

test("importing a well-formed but wrong-format file is also rejected cleanly", async ({
  page,
}) => {
  await page.goto("/");
  await createProfile(page, "Alex");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  const wrongFormatPath = test.info().outputPath("wrong-format.fdraft");
  await writeFile(
    wrongFormatPath,
    JSON.stringify({ hello: "world", nothing: "to see here" }),
  );

  await openSettings(page);
  await page.getByRole("button", { name: "Import FDraft Backup" }).click();
  await page
    .locator('input[type="file"][accept*=".fdraft"]')
    .setInputFiles(wrongFormatPath);

  await expect(page.getByText(/no recognizable/i)).toBeVisible();
  await expect(page.getByText(/FDraft Backup Found/)).toHaveCount(0);
});
