import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/product-spec.md, "HISTORY PAGE REDESIGN", "SECTION ONE —
 * RECENTLY WATCHED".
 */

test("shows a polished empty state before anything's been watched, and lists watched films most-recent-first with a readable date afterward", async ({
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

  await page.getByRole("link", { name: "History" }).click();
  await expect(
    page.getByRole("heading", { name: "Recently Watched" }),
  ).toBeVisible();
  await expect(page.getByText("Nothing watched yet")).toBeVisible();

  await page.getByRole("link", { name: "Watchlist" }).click();
  await page
    .getByRole("button", { name: 'Mark "Inception" as watched' })
    .click();
  await page
    .getByRole("button", { name: 'Mark "Parasite" as watched' })
    .click();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByText("Nothing watched yet")).not.toBeVisible();

  // Most recently watched first — Parasite was marked watched AFTER
  // Inception, so it must lead.
  const rows = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Recently Watched" }) })
    .locator("ul > li");
  await expect(rows.first()).toContainText("Parasite");
  await expect(rows.nth(1)).toContainText("Inception");

  // A readable date with a real month name, not a raw ISO string — e.g.
  // "11 August 2026" or "August 11, 2026" depending on locale, never
  // "2026-08-11". Locale-agnostic on purpose: this project's own date
  // formatting already defers to the browser's locale everywhere else
  // (see `formatReadableDate`), so the exact word order isn't the point.
  await expect(
    page.getByText(/[A-Za-z]+ \d{1,2},? \d{4}/).first(),
  ).toBeVisible();
  await expect(page.getByText(/\d{4}-\d{2}-\d{2}/)).not.toBeVisible();
});

test("shows which draft a watched film came from, when it came from one", async ({
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
  await page.getByRole("button", { name: /^Baby/ }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("heading", { name: /Baby draft/i }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Mark ".*" as watched$/ })
    .first()
    .click();

  await page.getByRole("link", { name: "History" }).click();
  await expect(
    page.getByRole("heading", { name: "Recently Watched" }),
  ).toBeVisible();
  await expect(page.getByText(/Via Baby draft/)).toBeVisible();
});
