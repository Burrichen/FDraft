import type { Page } from "@playwright/test";

/**
 * Dismisses the global Event introduction modal if it happens to be open.
 *
 * `EventIntroDialog` is mounted once in the app shell and shows for ANY
 * event whose natural window is currently open and whose occurrence this
 * profile hasn't answered yet (see `resolveEventIntroCandidate`). It is
 * therefore raised by the REAL calendar — which makes it a hazard for any
 * test that fast-forwards the browser clock: `page.clock.setFixedTime(now
 * + 31 days)` lands inside Halloween's window (30 Sep – 1 Nov) for a
 * whole month of the year, inside Christmas's for all of December, and
 * inside January's for the last week of that month. When it does, the
 * modal opens over the page and the test's own assertions fail on content
 * it is covering — a real, date-dependent flake that has nothing to do
 * with what those tests are actually verifying (draft expiry, postmortems,
 * historical sorting).
 *
 * Escape is the intro modal's own documented dismissal (see
 * `e2e/halloween-join-modal.spec.ts`, "Escape dismisses the modal"), and
 * it records an occurrence-scoped DECLINE rather than a permanent one — so
 * this leaves the profile in exactly the state a user who waved the modal
 * away would be in, and never opts anything in.
 *
 * A no-op when no modal is showing, so it is safe to call unconditionally
 * after any clock jump or reload.
 */
export async function dismissEventIntroIfPresent(page: Page): Promise<void> {
  const dialog = page.getByRole("alertdialog").first();
  try {
    // Deliberately WAITS rather than checking `count()` once: the modal is
    // driven by the shared Event Discovery read, which resolves
    // asynchronously after the page loads, so a single synchronous check
    // races it and returns "nothing here" a moment before it appears.
    await dialog.waitFor({ state: "visible", timeout: 2500 });
  } catch {
    // No modal appeared in that window — nothing to dismiss.
    return;
  }
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" }).catch(() => {
    // Not the intro modal (some other must-act dialog) — leave it alone
    // and let the calling test's own assertions speak.
  });
}
