import { expect, test } from "@playwright/test";

/**
 * See docs/product-spec.md, "PWA / OFFLINE APPLICATION SHELL" and "FINAL
 * TEST MATRIX" — Prompt 9.5D: "Disable network -> reload application ->
 * core UI still launches." This is the one offline scenario none of the
 * existing offline E2E coverage (`offline-core.spec.ts`,
 * `backup-restore.spec.ts`) actually tests — they all warm up a single
 * tab's client-router cache and then go offline WITHOUT ever reloading,
 * because a plain `page.goto()`/reload while offline needs the network to
 * deliver the HTML document itself (see Next's own "Handling connectivity
 * drops" guide). A real service worker (`src/app/sw.ts`, via Serwist) is
 * what makes a genuine offline *reload* possible at all.
 */
test.describe("PWA offline application shell", () => {
  test("a full page reload while offline still launches the core UI, after the service worker has cached it once online", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.getByLabel("Profile name").fill("Alex");
    await page.getByRole("button", { name: "Create Profile" }).click();
    await expect(
      page.getByRole("heading", { name: "Watchlist" }),
    ).toBeVisible();

    // Give the service worker time to install, activate, and precache —
    // this happens in the background the moment the page first loads.
    await page.waitForFunction(() =>
      navigator.serviceWorker.ready.then(() => true),
    );

    await context.setOffline(true);
    await page.reload();

    await expect(
      page.getByRole("heading", { name: "Watchlist" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
  });

  test("reloading a different previously-visited route offline also renders for real, not the offline fallback", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.getByLabel("Profile name").fill("Alex");
    await page.getByRole("button", { name: "Create Profile" }).click();
    // Settings is reached via the profile menu, not a top nav link — visit
    // it directly instead so the service worker gets a chance to cache it.
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    await page.waitForFunction(() =>
      navigator.serviceWorker.ready.then(() => true),
    );
    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("the manifest and app icons are all real, fetchable files", async ({
    page,
  }) => {
    const manifestResponse = await page.request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe("FDraft");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    for (const icon of manifest.icons) {
      const iconResponse = await page.request.get(icon.src);
      expect(iconResponse.ok(), `${icon.src} should be fetchable`).toBe(true);
      expect(iconResponse.headers()["content-type"]).toContain("image/png");
    }
  });
});
