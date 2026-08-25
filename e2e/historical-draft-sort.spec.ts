import path from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURE_CSV = path.join(__dirname, "fixtures", "sample-watchlist.csv");
const WATCHED_TITLES = ["Paddington 2", "Inception"];
const NOT_WATCHED_TITLES = [
  "Spirited Away",
  "Parasite",
  "The Grand Budapest Hotel",
];

/**
 * See docs/product-spec.md, "SORTING FOR FINALISED / HISTORICAL DRAFTS"
 * and "HISTORY PAGE REDESIGN", "HISTORICAL DRAFT FILMS": films are always
 * split into "Watched"/"Not Watched" groups now, with the chosen sort
 * controlling ordering WITHIN each group. Sets up one real archived draft
 * — two films marked watched, three resolved via postmortem after a
 * forced expiry — so both groups have real, meaningful data to sort, then
 * drives the Draft History page's sort control end to end.
 */
test("a finalised draft's films are grouped into Watched/Not Watched, its sort control defaults to Original Draft Order within each group, and never touches the stored order", async ({
  page,
  context,
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
  await page.getByRole("radio", { name: /^Timer/ }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("heading", { name: /Baby draft/i }),
  ).toBeVisible();

  // Mark exactly two specific films watched — which two is deliberate, so
  // the group-membership assertions below can check for them by name.
  await page
    .getByRole("button", { name: 'Mark "Paddington 2" as watched' })
    .click();
  await page
    .getByRole("button", { name: 'Mark "Inception" as watched' })
    .click();
  await expect(page.getByText(/2\/5 watched/)).toBeVisible();

  // Force the deadline to pass, then resolve the remaining three via
  // postmortem so the draft archives with a genuine watched/unwatched mix.
  const thirtyOneDaysLater = Date.now() + 31 * 24 * 60 * 60 * 1000;
  await page.clock.setFixedTime(thirtyOneDaysLater);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Baby draft — expired/i }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "I just didn't" }).first().click();
  }
  await expect(page.getByText("Draft complete — nice work!")).toBeVisible();
  await context.setOffline(false);

  await page.getByRole("link", { name: "draft history" }).click();
  await expect(
    page.getByRole("heading", { name: "Draft history" }),
  ).toBeVisible();
  // The summary's own heading-like text is "{Month} Baby Draft" (capital
  // "Draft" — see `getDraftDisplayName`), matched case-sensitively so it
  // can never ambiguously match "Recently Watched"'s "Via Baby draft"
  // origin lines, which use a lowercase "draft".
  await page.getByText(/Baby Draft/).click();

  await expect(page.getByText("Watched (2)")).toBeVisible();
  await expect(page.getByText("Not Watched (3)")).toBeVisible();

  // Each item row's title lives specifically in its `.text-foreground`
  // span — a plain `.locator("span").first()` would instead grab the
  // outer icon+text wrapper, whose `innerText()` also picks up the
  // nested "Watched <date>" line. Scoped separately per group so ordering
  // can be checked within each.
  async function groupTitles(groupHeading: string) {
    const group = page.getByText(groupHeading, { exact: true }).locator("..");
    const rows = group.locator("ul > li");
    const count = await rows.count();
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await rows
        .nth(i)
        .locator("span.text-foreground")
        .first()
        .innerText();
      titles.push(text.replace(/\s*\(\d{4}\)\s*$/, "").trim());
    }
    return titles;
  }

  const originalWatchedOrder = await groupTitles("Watched (2)");
  const originalNotWatchedOrder = await groupTitles("Not Watched (3)");
  expect(new Set(originalWatchedOrder)).toEqual(new Set(WATCHED_TITLES));
  expect(new Set(originalNotWatchedOrder)).toEqual(new Set(NOT_WATCHED_TITLES));

  const sortButton = page.getByRole("button", { name: "Sort" });
  await sortButton.click();
  await expect(
    page.getByRole("radio", { name: "Original Draft Order" }),
  ).toHaveAttribute("aria-checked", "true");

  // The popover (unlike a Menu) doesn't close on selection — see
  // `Popover`'s doc comment — so it stays open across every pick below;
  // no need to re-click the trigger between them.
  await page.getByRole("radio", { name: "Title" }).click();
  expect(await groupTitles("Watched (2)")).toEqual(
    [...WATCHED_TITLES].sort((a, b) => a.localeCompare(b)),
  );
  expect(await groupTitles("Not Watched (3)")).toEqual(
    [...NOT_WATCHED_TITLES].sort((a, b) => a.localeCompare(b)),
  );

  // Back to the default restores each group's exact original order —
  // proving nothing about the underlying stored order was ever actually
  // touched by any of the sorting above (see docs/product-spec.md:
  // "Historical draft data should never be destructively reordered in
  // the database. Sorting is presentation-only. Preserve the original
  // generated draft position.").
  await page.getByRole("radio", { name: "Original Draft Order" }).click();
  expect(await groupTitles("Watched (2)")).toEqual(originalWatchedOrder);
  expect(await groupTitles("Not Watched (3)")).toEqual(originalNotWatchedOrder);

  // A reload proves the same thing from the database's side, not just
  // this component's — sort state itself isn't persisted, so this also
  // confirms the default really is "Original Draft Order".
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Draft history" }),
  ).toBeVisible();
  await page.getByText(/Baby Draft/).click();
  expect(await groupTitles("Watched (2)")).toEqual(originalWatchedOrder);
  expect(await groupTitles("Not Watched (3)")).toEqual(originalNotWatchedOrder);
});
