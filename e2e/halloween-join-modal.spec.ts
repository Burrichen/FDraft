import { expect, test } from "@playwright/test";

/**
 * See docs/updates, "PROMPT B2.3 — HALLOWEEN JOIN MODAL COMPLETE
 * REDESIGN" — the much larger, richer join modal must still behave like a
 * real, accessible dialog at every viewport size: buttons fully contained
 * and clickable, long text wrapping cleanly, keyboard/focus-trap/Escape
 * conventions intact, and reduced motion respected. `halloween-visual-
 * experience.spec.ts` already covers the full opt-in → theme → easter-egg
 * journey; this spec is scoped to the modal itself.
 */

/**
 * Forces `EventSettings.eventsEnabled: true` (with no `activeEvent`) by
 * writing straight to IndexedDB, the same way the component-level tests
 * seed it directly through the repository layer.
 *
 * This is necessary, not just convenient: `resolveEventIntroToShow`
 * requires `eventsEnabled` to ALREADY be true before it will show the
 * global modal for ANY event — but every real, current UI action that
 * sets `eventsEnabled: true` (Settings' own "Join" button, or the modal's
 * own primary button) does so as part of opting in, which simultaneously
 * sets `activeEvent`, which ALSO blocks the modal. Leaving an event resets
 * `eventsEnabled` back to `false` too. So "`eventsEnabled: true` with no
 * active event" — the modal's own precondition — is a real, reachable
 * profile state (a fresh profile starts at `eventsEnabled: false`, and
 * this is the state that PRECEDES ever opting into anything for the very
 * first time) but is NOT reachable through today's UI without this: a
 * genuine, pre-existing gap in the feature, unrelated to and out of scope
 * for this modal-focused redesign (see the completion report).
 */
async function forceEventsEnabled(page: import("@playwright/test").Page) {
  const profileId = await page.evaluate(() =>
    window.localStorage.getItem("fdraft:last-active-profile-id"),
  );
  await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open("fdraft");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put({
        profileId: id,
        key: "events.settings",
        value: {
          eventsEnabled: true,
          eventVisualsEnabled: false,
          activeEvent: null,
          manuallyEnabledEvents: [],
        },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, profileId);
}

/**
 * Returns the modal's own root, scoped so every subsequent query is
 * unambiguous — Settings' "Available now" list (`EventSwitcherSection`)
 * also renders a "Let me in." button on the SAME page once the profile is
 * eligible, so any un-scoped `getByRole("button", { name: "Let me in." })`
 * would match two real, independent buttons at once.
 */
async function openHalloweenJoinModal(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();

  await page.goto("/settings");
  await page.locator("#admin-mode").click();
  await expect(page.getByText("Event Testing")).toBeVisible();
  await page.selectOption("#event-date-override", "halloween");
  await page.fill("#event-date-override-manual", "2026-10-15T12:00");
  await expect(page.getByText(/test date active/i)).toBeVisible();

  await forceEventsEnabled(page);

  // A page not competing with Settings' own "Available now" inline
  // Join button/card, so the global modal is unambiguously the only
  // "Let me in." surface present.
  await page.goto("/watchlist");
  // "Featuring:" only ever appears inside the modal's own rich intro
  // content — a reliable, unambiguous signal that it has actually opened.
  await expect(page.getByText("Featuring:")).toBeVisible();
  return page.getByRole("alertdialog");
}

test.describe("Halloween join modal — responsive layout", () => {
  for (const [label, size] of [
    ["desktop", { width: 1440, height: 900 }],
    ["1024", { width: 1024, height: 800 }],
    ["tablet (768)", { width: 768, height: 1024 }],
    ["375", { width: 375, height: 812 }],
    ["320", { width: 320, height: 640 }],
  ] as const) {
    test(`renders with both buttons fully contained and clickable at ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      const dialog = await openHalloweenJoinModal(page);

      const title = dialog.getByRole("heading", { name: "Halloween" });
      const primary = dialog.getByRole("button", { name: "Let me in." });
      const secondary = dialog.getByRole("button", {
        name: "I don't want to be scared!",
      });

      await expect(title).toBeVisible();
      await expect(primary).toBeVisible();
      await expect(secondary).toBeVisible();

      // The dialog itself never overflows the viewport horizontally —
      // "never overflow unusably" (see docs/updates §1).
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(
        size.width + 1, // sub-pixel rounding tolerance
      );

      // Both buttons are fully inside the dialog's own bounds — "remain
      // fully contained inside the modal" (see docs/updates §"BUTTONS
      // MUST FIT") — never clipped or overlapping each other.
      const dialogBounds = dialogBox!;
      for (const button of [primary, secondary]) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(dialogBounds.x - 1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(
          dialogBounds.x + dialogBounds.width + 1,
        );
      }
      const primaryBox = (await primary.boundingBox())!;
      const secondaryBox = (await secondary.boundingBox())!;
      // Never overlapping — either stacked (no horizontal overlap zone
      // sharing the same row) or side-by-side (no vertical overlap).
      const horizontallyOverlapping =
        primaryBox.x < secondaryBox.x + secondaryBox.width &&
        secondaryBox.x < primaryBox.x + primaryBox.width;
      const verticallyOverlapping =
        primaryBox.y < secondaryBox.y + secondaryBox.height &&
        secondaryBox.y < primaryBox.y + primaryBox.height;
      expect(horizontallyOverlapping && verticallyOverlapping).toBe(false);

      // The click actually lands on the real button, not a decoration
      // sitting visually on top of it (decorations are pointer-events-none
      // and kept clear of the footer, but this proves it end-to-end).
      await secondary.click();
      await expect(dialog).not.toBeVisible();
    });
  }
});

test.describe("Halloween join modal — long text wrapping", () => {
  test("the long secondary button label never overflows its button at 320px, stacking full-width instead", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const dialog = await openHalloweenJoinModal(page);
    const secondary = dialog.getByRole("button", {
      name: "I don't want to be scared!",
    });
    const primary = dialog.getByRole("button", { name: "Let me in." });
    await expect(secondary).toBeVisible();
    await expect(primary).toBeVisible();

    // At this width the button goes full-width and stacks above/below the
    // other button rather than wrapping its own label onto multiple lines
    // — the label still must never overflow the button's own box, and
    // wrapping (if the label were long enough to need it) must not clip.
    const overflowsHorizontally = await secondary.evaluate(
      (node) => node.scrollWidth > node.clientWidth + 1,
    );
    expect(overflowsHorizontally).toBe(false);

    const primaryBox = (await primary.boundingBox())!;
    const secondaryBox = (await secondary.boundingBox())!;
    // Stacked, not side-by-side: the two buttons occupy different rows.
    expect(
      Math.abs(primaryBox.y - secondaryBox.y) >
        Math.min(primaryBox.height, secondaryBox.height) / 2,
    ).toBe(true);
  });
});

test.describe("Halloween join modal — keyboard and motion", () => {
  test("Escape dismisses the modal (existing modal convention)", async ({
    page,
  }) => {
    const dialog = await openHalloweenJoinModal(page);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("Tab cycles focus within the dialog without escaping it (focus trap)", async ({
    page,
  }) => {
    const dialog = await openHalloweenJoinModal(page);

    // Base UI's focus trap uses sibling focus-guard <span> elements to
    // redirect wrapping focus back into the dialog; the redirect happens
    // via a focus event handler, so a brief settle delay is needed after
    // each synthetic Tab press to avoid catching focus mid-redirect
    // (transiently on a guard or document.body) rather than asserting a
    // real escape to page content behind the dialog.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(50);
      const activeInsideDialog = await dialog.evaluate(
        (node, active) => node.contains(active),
        await page.evaluateHandle(() => document.activeElement),
      );
      expect(activeInsideDialog).toBe(true);
    }
  });

  test("respects prefers-reduced-motion — the modal still opens and both buttons work immediately", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const dialog = await openHalloweenJoinModal(page);

    const primary = dialog.getByRole("button", { name: "Let me in." });
    await expect(primary).toBeVisible();
    await primary.click();
    await expect(dialog).not.toBeVisible();
  });
});

test.describe("Halloween join modal — decline flow", () => {
  test("declining never opts the profile in", async ({ page }) => {
    const dialog = await openHalloweenJoinModal(page);
    await dialog
      .getByRole("button", { name: "I don't want to be scared!" })
      .click();
    await expect(dialog).not.toBeVisible();

    await page.goto("/settings");
    await expect(page.getByText("Available now")).toBeVisible();
  });
});
