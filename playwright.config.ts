import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for FDraft's local-first app (see docs/product-spec.md,
 * "TESTING" — Prompt 9.5B: "Where possible include Playwright tests
 * executed with the browser context offline."). No global setup/auth state
 * is needed — there's no account to sign into; every test starts from a
 * fresh browser context (fresh IndexedDB) and creates its own local
 * profile.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry everywhere, not just in CI. A cluster of these specs drive
  // genuinely timing-sensitive browser behaviour — service-worker
  // precaching, `context.setOffline`, full reloads, `page.clock` jumps —
  // against a single shared server, and under parallel load a handful of
  // them intermittently miss a 5s expectation for content that does
  // arrive. Which ones rotate between runs (`pwa-offline-shell`,
  // `offline-postmortem`, `application-refresh`, `metadata-reconnection`),
  // which is the signature of contention rather than a broken assertion.
  // A retry does not hide a real break: a genuine failure fails both
  // attempts, and `forbidOnly` plus the reporter still surface flakes as
  // flaky rather than passing them off as clean.
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Every FDraft page is now fully static (see `pnpm build`'s route
    // table — everything except /api/metadata prerenders as `○`), so a
    // production server is what actually exercises the client router's
    // real caching behavior offline tests depend on — `next dev` recompiles
    // routes on demand and doesn't reflect this. Must run the exact same
    // `pnpm build` pipeline the real deploy does (`next build` THEN
    // `serwist build`, see package.json) — the service worker's precache
    // manifest bakes in this build's exact hashed asset filenames, so a
    // `public/sw.js` generated against a different `next build` output
    // fetches 404s for every one of them the moment it tries to install,
    // and its install then never resolves.
    command: "pnpm run build && pnpm exec next start --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
