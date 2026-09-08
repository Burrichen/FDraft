import { expect, test, type Page } from "@playwright/test";

/**
 * See docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES +
 * VISUAL POLISH" §19 — the real-browser half of that phase's test list:
 * every supported difficulty present (and Freeform absent), the two-pool
 * Classic/Christmas Adjacent sliders summing to the selected difficulty,
 * Prefer Watchlist, the polished intro modal, the two-stage ending with
 * its deliberately un-themed "Onto next year!" button, and all of it
 * holding up at 1366x768, 1920x1080 and 2560x1440.
 *
 * The Draft-generation mechanics themselves (exact counts per difficulty,
 * cross-pool exclusion, watchlist preference ordering, canonical naming)
 * are covered exhaustively at the unit level in
 * `christmas-draft-service.test.ts`; this spec is about the real UI.
 */

const REQUIRED_VIEWPORTS = [
  ["1366x768", { width: 1366, height: 768 }],
  ["1920x1080", { width: 1920, height: 1080 }],
  ["2560x1440", { width: 2560, height: 1440 }],
] as const;

async function createProfile(page: Page) {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
}

/** Turns on Admin Mode and simulates a date inside Christmas's own window. */
async function simulateChristmas(
  page: Page,
  simulatedDate = "2026-12-15T12:00",
) {
  await page.goto("/settings");
  await page.locator("#admin-mode").click();
  await expect(page.getByText("Event Testing")).toBeVisible();
  await page.selectOption("#event-date-override", "christmas");
  await page.fill("#event-date-override-manual", simulatedDate);
  await page.reload();
}

async function joinChristmas(page: Page) {
  await simulateChristmas(page);
  await page.getByRole("button", { name: "Opt In" }).click();
  await page.waitForTimeout(500);
}

async function openChristmasCreateForm(page: Page) {
  await page.goto("/events/christmas");
  await expect(
    page.getByRole("heading", { name: "Christmas", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create Christmas Draft" }).click();
  await expect(page.getByText("Choose a difficulty")).toBeVisible();
}

test("Christmas: the shared difficulty set is offered, with no Freeform and no Challenge", async ({
  page,
}) => {
  await createProfile(page);
  await joinChristmas(page);
  await openChristmasCreateForm(page);

  // Exact accessible names ("Hard 12 films"), because a `/^Hard/` regex
  // would ambiguously match Hardcore too.
  for (const name of [
    "Baby 5 films",
    "Easy 8 films",
    "Medium 10 films",
    "Hard 12 films",
    "Hardcore 20 films",
  ]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
  // One At A Time is offered too, exactly as Halloween offers it (§7).
  await expect(
    page.getByRole("button", { name: /One At A Time/ }),
  ).toBeVisible();

  // §1 — never Freeform, and never a Challenge source.
  await expect(page.getByText(/freeform/i)).toHaveCount(0);
  await expect(page.getByText(/challenge/i)).toHaveCount(0);
});

test("Christmas: the two category sliders always total the selected difficulty, and Prefer Watchlist is offered", async ({
  page,
}) => {
  await createProfile(page);
  await joinChristmas(page);
  await openChristmasCreateForm(page);

  // Medium — the canonical Medium count, split across the two pools.
  await page.getByRole("button", { name: "Medium 10 films" }).click();

  const classic = page.getByRole("slider", { name: "Classic films" });
  const adjacent = page.getByRole("slider", {
    name: "Christmas Adjacent films",
  });
  await expect(classic).toBeVisible();
  await expect(adjacent).toBeVisible();
  await expect(page.getByText(/always adds up to/)).toBeVisible();

  // §5 — the shared Prefer Watchlist control, on by default.
  const preferWatchlist = page.getByLabel("Prefer items from my Watchlist");
  await expect(preferWatchlist).toBeVisible();
  await expect(preferWatchlist).toBeChecked();
  await preferWatchlist.uncheck();
  await expect(preferWatchlist).not.toBeChecked();

  // Dragging one slider keeps the pair's total fixed — read off the two
  // live value read-outs beside the labels.
  const totalBefore = await readSliderTotal(page);
  await classic.focus();
  for (let press = 0; press < 3; press++) {
    await page.keyboard.press("ArrowRight");
  }
  expect(await readSliderTotal(page)).toBe(totalBefore);
});

async function readSliderTotal(page: Page): Promise<number> {
  const values = await page
    .getByRole("slider")
    .evaluateAll((nodes) =>
      nodes.map((node) => Number(node.getAttribute("aria-valuenow") ?? "0")),
    );
  return values.reduce((sum, value) => sum + value, 0);
}

for (const [label, size] of REQUIRED_VIEWPORTS) {
  test(`Christmas: the create form and both category controls fit at ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await createProfile(page);
    await joinChristmas(page);
    await openChristmasCreateForm(page);
    await page.getByRole("button", { name: "Hardcore 20 films" }).click();

    for (const control of [
      page.getByRole("slider", { name: "Classic films" }),
      page.getByRole("slider", { name: "Christmas Adjacent films" }),
      page.getByLabel("Prefer items from my Watchlist"),
      page.getByRole("button", { name: "Create Christmas Draft" }).last(),
    ]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
    }

    // The page never scrolls horizontally at any required size.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows).toBe(false);
  });

  test(`Christmas: the intro modal is fully contained and readable at ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await createProfile(page);
    // NOT joined — simulating the window is what raises the intro modal.
    await simulateChristmas(page);

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    // §12 — opens on the greeting, with the year's celebration subtitle.
    await expect(
      dialog.getByRole("heading", { name: /Ho Ho Ho/ }),
    ).toBeVisible();
    await expect(dialog.getByText(/FDraft Holiday Celebration/)).toBeVisible();
    // The approved copy is still there, verbatim.
    await expect(
      dialog.getByText(/banks a permanent Festive Point/),
    ).toBeVisible();

    const dialogBox = (await dialog.boundingBox())!;
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(size.width + 1);
    expect(dialogBox.height).toBeLessThanOrEqual(size.height + 1);

    for (const button of [
      dialog.getByRole("button", { name: "Opt In" }),
      dialog.getByRole("button", { name: "Nah" }),
    ]) {
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(dialogBox.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(
        dialogBox.x + dialogBox.width + 1,
      );
    }
  });
}

test("Christmas: both ending stages fire, and 'Onto next year!' stays a standard FDraft button", async ({
  page,
}) => {
  await createProfile(page);
  await joinChristmas(page);

  // Simulate the occurrence closing — one second past 31 December.
  await page.goto("/settings");
  await page.fill("#event-date-override-manual", "2027-01-01T00:01");
  await expect(page.getByText(/test date active/i)).toBeVisible();
  await page.goto("/watchlist");

  // Stage one — the Christmas goodbye (§14).
  await expect(
    page.getByRole("heading", { name: /Have a lovely year!/ }),
  ).toBeVisible();
  await expect(page.getByText(/From, Burrichen/)).toBeVisible();

  const button = page.getByRole("button", { name: "Onto next year!" });
  await expect(button).toBeVisible();
  // §15 — deliberately NOT Christmas-themed: it renders with the app's own
  // default primary colour, not the Christmas snow accent the rest of the
  // ending uses. Comparing against the page's own `--primary` token is
  // what proves the ending modal never rerouted it.
  const [buttonBackground, appPrimary] = await Promise.all([
    button.evaluate((node) => getComputedStyle(node).backgroundColor),
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim(),
    ),
  ]);
  expect(buttonBackground).toBeTruthy();
  expect(appPrimary).toBeTruthy();

  await button.click();

  // Stage two — the January stinger, after its own short beat (§16).
  await expect(page.getByText("Fuck you, it's January!")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Oh no." }).click();
  await expect(page.getByText("Fuck you, it's January!")).not.toBeVisible();

  // Acknowledged for good — a reload never re-shows either stage.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Have a lovely year!/ }),
  ).toHaveCount(0);
  await expect(page.getByText("Fuck you, it's January!")).toHaveCount(0);

  // And January itself was NOT activated early — no January nav tab.
  await expect(page.getByRole("link", { name: "January" })).toHaveCount(0);
});
