import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * Regression test for docs/product-spec.md, "Draft Time Mode" — "Calendar
 * Mode Progress": a Calendar Mode draft's TIME progress bar tracks
 * progress through the WHOLE CALENDAR MONTH, not through the draft's own
 * (possibly late-in-the-month) creation-to-deadline window. Before this
 * fix, a draft created on 11 August read "0% elapsed" — this is the exact
 * bug reported, reproduced here with a fixed clock rather than screenshots.
 */
test("a Calendar Mode draft created partway through the month shows real month progress, not 0%", async ({
  page,
}) => {
  await page.goto("/");
  // Fixed at 11 August, mid-month — the exact scenario from the bug report.
  await page.clock.setFixedTime(new Date("2026-08-11T12:00:00.000Z"));

  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await page.getByRole("button", { name: /^Baby/ }).click();
  // Calendar Mode is the default toggle state — deliberately left unclicked.
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("heading", { name: /Baby draft/i }),
  ).toBeVisible();

  const elapsedText = page.getByText(/% elapsed/).first();
  await expect(elapsedText).toBeVisible();
  await expect(elapsedText).not.toContainText("0% elapsed");

  const percent = Number(
    (await elapsedText.textContent())?.match(/(\d+)% elapsed/)?.[1],
  );
  // Roughly a third of the way through August, generously bounded to stay
  // stable across whatever timezone the test runner happens to be in.
  expect(percent).toBeGreaterThan(10);
  expect(percent).toBeLessThan(90);
});

test("a Timer Mode draft's progress still measures from its own creation instant, not the calendar month", async ({
  page,
}) => {
  await page.goto("/");
  await page.clock.setFixedTime(new Date("2026-08-11T12:00:00.000Z"));

  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await page.getByRole("button", { name: /^Baby/ }).click();
  await page.getByRole("radio", { name: /^Timer/ }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("heading", { name: /Baby draft/i }),
  ).toBeVisible();

  // Just created — 0% elapsed of the 30-day timer, unaffected by whatever
  // day of the month it happens to be.
  await expect(page.getByText(/% elapsed/).first()).toContainText("0% elapsed");
});
