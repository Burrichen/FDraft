import { expect, test } from "@playwright/test";

/**
 * See docs/updates, "FDRAFT UPDATE 1 — F* YOU, IT'S JANUARY: SIMPLE EVENT
 * MECHANICS" §17 — the full real-browser walkthrough of January's
 * deliberately simplest-in-FDraft mechanic: JOIN → one random film from
 * `public/events/january/films.json` is rolled and persisted immediately →
 * that film IS the January Event Draft. Replaces
 * `january-one-at-a-time.spec.ts`, which exercised the generic
 * `/drafts/new` → One At A Time hand-off January no longer has.
 *
 * Deliberately makes NO watchlist import at all: January's curated list is
 * now its whole authoritative pool, so a brand-new profile with an empty
 * watchlist must still get a film — proving §17's "Watchlist irrelevant to
 * selection" end to end, in the real app, against the real shipped
 * `films.json`.
 */

/** The intro dialog's accessible name. */
const JANUARY_HEADING = /F\* You, It's January!/;
/**
 * The PAGE's own h1 — matched exactly, since the rolled Draft's own
 * canonical h1 ("F* You, It's January! <year> Draft") is a prefix match
 * for the same event name and would otherwise make this ambiguous.
 */
const JANUARY_PAGE_HEADING = "F* You, It's January!";

async function createProfileAndJoinJanuary(
  page: import("@playwright/test").Page,
) {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  await page.goto("/settings");
  await page.locator("#admin-mode").click();
  await expect(page.getByText("Event Testing")).toBeVisible();
  await page.selectOption("#event-date-override", "f-you-its-january");
  // 2027, not 2026: `DraftLifecycleView`'s own lazy expiry check runs on
  // the REAL wall clock (by design — see its `expireLocalDraftIfDue`
  // call), so simulating a January whose occurrence end has already
  // passed in real time would correctly, but unhelpfully, render the
  // freshly-rolled Draft as "expired" before this test could look at it.
  // Simulating the NEXT January keeps the fixed Event deadline genuinely
  // in the future, exactly like `halloween-*.spec.ts` does.
  await page.fill("#event-date-override-manual", "2027-01-28T12:00");
  // Reloading with January's simulated date active raises the generic
  // Event introduction modal. Joining THROUGH that modal (rather than
  // racing Settings' own Opt In button before it appears) is what makes
  // this deterministic: the modal only closes once the join — and, for
  // January, its one-film roll — has actually completed.
  await page.reload();
  const intro = page.getByRole("alertdialog", { name: JANUARY_HEADING });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: "Opt In" }).click();
  await expect(intro).not.toBeVisible();
}

test("January: joining immediately rolls exactly one film, with no creation step and no builder UI", async ({
  page,
}) => {
  await createProfileAndJoinJanuary(page);

  // Joining lands on January's own page, with the Draft ALREADY built.
  await page.goto("/events/january");
  await expect(
    page.getByRole("heading", { name: JANUARY_PAGE_HEADING, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Event ends 31 January at midnight"),
  ).toBeVisible();

  // The canonical occurrence Draft name, and exactly one film in it.
  await expect(
    page.getByRole("heading", { name: /F\* You, It's January! 2027 Draft/ }),
  ).toBeVisible();
  await expect(page.getByText("0/1 watched · 0%")).toBeVisible();

  // No second "Create Draft" step, and none of the Draft-builder
  // machinery January deliberately doesn't have.
  for (const forbidden of [
    /create draft/i,
    /create january draft/i,
    /choose a difficulty/i,
    /how do you want the list to be made/i,
    /challenge films/i,
    /one at a time/i,
    /choose my own/i,
    /which category should we draw from/i,
    /calendar mode/i,
    /timer mode/i,
    /^reroll$/i,
  ]) {
    await expect(page.getByText(forbidden)).toHaveCount(0);
  }
  await expect(page.locator('input[type="range"]')).toHaveCount(0);
});

test("January: reloading and navigating away never rerolls the film", async ({
  page,
}) => {
  await createProfileAndJoinJanuary(page);
  await page.goto("/events/january");
  await expect(page.getByText("0/1 watched · 0%")).toBeVisible();

  // The rolled film's title, read from its card's own title paragraph.
  // Deliberately WAITS for that text to be non-empty before reading it:
  // the original version scraped the whole list item's text immediately,
  // which under parallel load could be captured while the card was still
  // settling (and could pick up chrome around the title). The January page
  // renders exactly one list — the films grid — so a single listitem is
  // unambiguous here. A curated Event film has no Letterboxd slug and
  // (off-watchlist) no watch-toggle entry id, so the title is the only
  // always-present hook on the card.
  const rolledTitle = async () => {
    const title = page.getByRole("listitem").first().locator("p").first();
    await expect(title).not.toBeEmpty();
    return (await title.innerText()).trim();
  };

  const firstTitle = await rolledTitle();
  expect(firstTitle.length).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByText("0/1 watched · 0%")).toBeVisible();
  expect(await rolledTitle()).toBe(firstTitle);

  await page.goto("/watchlist");
  await page.goto("/stats");
  await page.goto("/events/january");
  await expect(page.getByText("0/1 watched · 0%")).toBeVisible();
  expect(await rolledTitle()).toBe(firstTitle);
});

test("January: the One At A Time builder refuses to open for January at all", async ({
  page,
}) => {
  await createProfileAndJoinJanuary(page);
  await page.goto("/events/january");
  await expect(page.getByText("0/1 watched · 0%")).toBeVisible();

  // A hand-crafted January event URL is refused outright — the generic
  // `/drafts/new` form already never hands January off (unit-tested in
  // `actions.test.ts`/`new-draft-form`), so this is the guard for a URL
  // arriving any other way.
  await page.goto("/drafts/new/one-at-a-time?eventId=f-you-its-january");
  await expect(
    page.getByText(/doesn't use One At A Time drafting/i),
  ).toBeVisible();

  // January's own Draft is untouched by that.
  await page.goto("/events/january");
  await expect(page.getByText("0/1 watched · 0%")).toBeVisible();
});
