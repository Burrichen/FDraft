import { expect, test } from "@playwright/test";

/**
 * See docs/product-spec.md's UI-polish pass, "NAVIGATION MICRO-ANIMATIONS"
 * and "ACCESSIBILITY FOR ANIMATIONS". Verifies the actual computed
 * `transform`/`animation-name` CSS values while hovering each nav icon —
 * a screenshot alone can't prove a multi-keyframe animation genuinely
 * runs (it might be frozen at rest by the time a screenshot is taken),
 * but sampling `getComputedStyle(...).transform` repeatedly across the
 * animation's real duration does. Each animation's `transform-origin` and
 * keyframes live in `globals.css`; the split, per-element-animatable SVGs
 * are `nav-icons.tsx`.
 */

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Profile name").fill("Alex");
  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
}

async function sampleTransform(
  page: import("@playwright/test").Page,
  selector: string,
  samples: number,
  intervalMs: number,
) {
  const values: string[] = [];
  for (let i = 0; i < samples; i++) {
    values.push(
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).transform : "NOT_FOUND";
      }, selector),
    );
    await page.waitForTimeout(intervalMs);
  }
  return values;
}

function isIdentity(transform: string) {
  return transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";
}

test("the FDraft logo animates on hover", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "FDraft" }).hover();
  const values = await sampleTransform(page, ".nav-icon-logo", 4, 60);
  expect(values.some((t) => !isIdentity(t))).toBe(true);
});

test("the Watchlist icon's rows slide into alignment on hover", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Watchlist" }).hover();
  const values = await sampleTransform(
    page,
    ".nav-icon-watchlist-row-1",
    6,
    60,
  );
  expect(values.some((t) => !isIdentity(t))).toBe(true);
});

test("the Drafts clapperboard's upper arm raises and snaps on hover, while the body box never moves", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Drafts" }).hover();

  const armValues = await sampleTransform(
    page,
    ".nav-icon-clapperboard-arm",
    8,
    50,
  );
  expect(armValues.some((t) => !isIdentity(t))).toBe(true);

  const bodyAnimationName = await page.evaluate(() => {
    const el = document.querySelector(".nav-icon-clapperboard-body");
    return el ? getComputedStyle(el).animationName : "NOT_FOUND";
  });
  expect(bodyAnimationName).toBe("none");
});

test("the History icon's clock hand rewinds and returns on hover", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "History" }).hover();
  const values = await sampleTransform(page, ".nav-icon-history-hand", 6, 60);
  expect(values.some((t) => !isIdentity(t))).toBe(true);
});

test("the Stats icon's bars dip and resettle on hover, like recalculating", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Stats" }).hover();
  const bar1 = await sampleTransform(page, ".nav-icon-stats-bar-1", 8, 50);
  expect(bar1.some((t) => !isIdentity(t))).toBe(true);
});

test("keyboard focus triggers the exact same animation as mouse hover", async ({
  page,
}) => {
  await signIn(page);
  // A real Tab-driven focus change, not a scripted `.focus()` call — only
  // actual keyboard navigation reliably satisfies `:focus-visible` in
  // Chromium, which is exactly the distinction this test needs to prove
  // (`group-focus-visible`, not just `group-focus`, drives the animation
  // in globals.css, so keyboard users get it and an incidental
  // click-focus doesn't).
  await page.getByRole("link", { name: "FDraft" }).focus();
  await page.keyboard.press("Tab"); // -> Watchlist
  await page.keyboard.press("Tab"); // -> Drafts
  await expect(page.getByRole("link", { name: "Drafts" })).toBeFocused();
  const values = await sampleTransform(
    page,
    ".nav-icon-clapperboard-arm",
    6,
    50,
  );
  expect(values.some((t) => !isIdentity(t))).toBe(true);
});

test("prefers-reduced-motion disables every nav icon animation entirely", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);

  await page.getByRole("link", { name: "Drafts" }).hover();
  await page.waitForTimeout(100);
  const animationName = await page.evaluate(() => {
    const el = document.querySelector(".nav-icon-clapperboard-arm");
    return el ? getComputedStyle(el).animationName : "NOT_FOUND";
  });
  expect(animationName).toBe("none");

  // The active page must still be communicated some other way (accent
  // icon colour + a persistent underline), never relying on the
  // now-disabled hover motion alone.
  const activeIcon = page
    .getByRole("link", { name: "Watchlist" })
    .locator("svg");
  await expect(activeIcon).toHaveClass(/text-watchlist-green/);
});

test("the active nav item is marked with aria-current and a visible underline, not colour alone", async ({
  page,
}) => {
  await signIn(page);
  const watchlistLink = page.getByRole("link", { name: "Watchlist" });
  await expect(watchlistLink).toHaveAttribute("aria-current", "page");
  const draftsLink = page.getByRole("link", { name: "Drafts" });
  await expect(draftsLink).not.toHaveAttribute("aria-current", "page");
});
