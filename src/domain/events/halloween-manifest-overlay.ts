/**
 * The current Halloween manifest's resolved Horror/Kitsch local film ids —
 * deliberately Halloween-specific (see `january-manifest-overlay.ts` for
 * the equivalent January mechanism this mirrors). Unlike January's overlay
 * (an ADDITIVE eligibility bonus layered onto the normal watchlist pool),
 * Halloween's Horror/Kitsch pools ARE the pool a Halloween Draft draws
 * from — so `createHalloweenLocalDraft` reads this directly rather than
 * threading it through `EventEligibilityRules`.
 *
 * Populated once by `refreshHalloweenManifestManifest` (app start / a
 * Settings-triggered refresh) and read synchronously at draft-creation
 * time — a plain module-level mutable pair, the same "resolved once,
 * available everywhere without a repeated live fetch" pattern January's
 * overlay already uses.
 */
export interface HalloweenManifestFilmIds {
  horrorFilmIds: string[];
  kitschFilmIds: string[];
}

let currentHalloweenManifestFilmIds: HalloweenManifestFilmIds = {
  horrorFilmIds: [],
  kitschFilmIds: [],
};

export function setHalloweenManifestFilmIds(
  pools: HalloweenManifestFilmIds,
): void {
  currentHalloweenManifestFilmIds = pools;
}

export function getHalloweenManifestFilmIds(): HalloweenManifestFilmIds {
  return currentHalloweenManifestFilmIds;
}
