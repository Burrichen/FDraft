import { expect, test } from "@playwright/test";

/**
 * See docs/product-spec.md, "TYPOGRAPHY", "OFFLINE FONT REQUIREMENT" —
 * `next/font/google` self-hosts font files at build time, so the running
 * app should never need to reach fonts.googleapis.com/fonts.gstatic.com
 * (or any other font CDN) at runtime. Blocking those hosts outright and
 * confirming the app still renders in the intended font proves this by
 * construction, rather than merely trusting `next/font`'s own behaviour.
 */
test("typography renders correctly even with every font CDN host blocked outright", async ({
  page,
  context,
}) => {
  let blockedRequestMade = false;
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => {
    blockedRequestMade = true;
    route.abort();
  });

  await page.goto("/");
  await expect(page.getByLabel("Profile name")).toBeVisible();

  const bodyFontFamily = await page.evaluate(
    () => getComputedStyle(document.body).fontFamily,
  );
  expect(bodyFontFamily).toContain("Manrope");
  expect(blockedRequestMade).toBe(false);
});
