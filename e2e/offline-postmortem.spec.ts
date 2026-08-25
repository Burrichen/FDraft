import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");

/**
 * See docs/product-spec.md, "FINAL TEST MATRIX" — Prompt 9.5D: "Offline
 * Postmortem: Offline -> expire/test deadline -> submit postmortem ->
 * archive draft." Nothing in this app runs a background job to expire a
 * draft (see `expireLocalDraftIfDue`'s own doc comment — "there is no
 * background worker here either") — expiry is only ever checked the next
 * time the Drafts page loads, comparing the real device clock against the
 * stored deadline. Waiting 30 real days isn't practical in a test, so this
 * uses Playwright's `page.clock` to fast-forward the *browser's* clock
 * past the deadline instead — the same one `SystemClock` reads from in
 * the running app, so this exercises the real expiry check, not a stub.
 */
test("expiring a draft, answering its postmortem, and archiving it all work fully offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .getByLabel(/Watchlist CSV or export ZIP/i)
    .setInputFiles(FIXTURE_CSV);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  // Timer mode (exactly 30 days from now) rather than the Calendar default
  // (end of this month) — deterministic regardless of what day of the
  // month the test happens to run on.
  await page.getByRole("link", { name: "Drafts" }).click();
  await page.getByRole("button", { name: "Start a draft" }).click();
  await page.getByRole("button", { name: /^Baby/ }).click();
  await page.getByRole("radio", { name: /^Timer/ }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("heading", { name: /Baby draft/i }),
  ).toBeVisible();

  // Deliberately never marking anything watched — every film needs a
  // postmortem answer once the draft expires.
  const thirtyOneDaysLater = Date.now() + 31 * 24 * 60 * 60 * 1000;
  await page.clock.setFixedTime(thirtyOneDaysLater);

  await context.setOffline(true);
  await page.reload();

  await expect(
    page.getByRole("heading", { name: /Baby draft — expired/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Why didn't you watch these?" }),
  ).toBeVisible();

  const responses = [
    "I didn't get time, but I wanted to!",
    "Actually, I don't think I want to watch this at all",
    "I just didn't",
  ];

  // Answer every unresolved film, cycling through all three response
  // types — always the FIRST remaining button, since each answered card
  // stops offering buttons at all (replaced with "You said: ...").
  for (let i = 0; i < 5; i++) {
    const label = responses[i % responses.length];
    await page.getByRole("button", { name: label }).first().click();
    await expect(page.getByText(`You said: ${label}`).first()).toBeVisible();
  }

  // Every film resolved -> the draft auto-archives and disappears from
  // the Active Draft page, replaced with a completion banner.
  await expect(page.getByText("Draft complete — nice work!")).toBeVisible();

  await page.getByRole("link", { name: "draft history" }).click();
  await expect(
    page.getByRole("heading", { name: "Draft history" }),
  ).toBeVisible();
  await expect(page.getByText(/Baby/i).first()).toBeVisible();
});
