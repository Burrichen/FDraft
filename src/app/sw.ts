/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * FDraft's application-shell cache (see docs/product-spec.md, "PWA /
 * OFFLINE APPLICATION SHELL" — Prompt 9.5D). Built by `@serwist/cli` (see
 * `serwist.config.mjs` and `package.json`'s `build` script), which injects
 * `__SW_MANIFEST` with a real, versioned list of every static asset and
 * prerendered page from this exact build — a fresh deploy produces a fresh
 * manifest, so `skipWaiting`/`clientsClaim` mean a returning visitor picks
 * up the new version on their very next load rather than being stuck on a
 * stale cached shell.
 *
 * `runtimeCaching: defaultCache` is `@serwist/next`'s own recommended
 * policy for a Next.js app (NetworkFirst for documents/RSC payloads —
 * fresh content when online, the last-cached copy the instant it isn't;
 * CacheFirst/StaleWhileRevalidate for hashed static JS/CSS/image assets,
 * which never change contents under a given URL) — not something worth
 * hand-rolling. It intercepts GET requests only, so the metadata
 * enrichment endpoint (`POST /api/metadata`) passes straight through
 * untouched, and this service worker never affects the honest
 * online/offline detection `local-metadata-service.ts` already does
 * itself by inspecting real fetch failures.
 *
 * The one addition on top of that default policy: a navigation fallback
 * for the one case it doesn't cover — a route this device has never
 * opened before, requested while offline. Every previously-visited route
 * still renders for real from its own cached entry; this only replaces
 * the browser's native "no internet" error page for the genuinely
 * uncached case.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
