/**
 * The in-memory seam between the (async, network/cache-backed) January
 * event manifest system (see `src/application/events/january-manifest-service.ts`)
 * and the (synchronous, pure) event registry (see docs/updates, "GLOBAL
 * CURATED JANUARY LIST"). `EventDefinition`/`getEventDefinition` stay
 * synchronous and side-effect-free everywhere else in this app — every
 * existing caller (`createLocalDraft`, `resolveDraftCompletionReward`,
 * `EventSwitcherSection`, etc.) reads a fully-formed `EventDefinition`
 * without awaiting anything. This module-level, mutable value is the ONE
 * place a later manifest refresh can change what that synchronous lookup
 * returns, by updating this ahead of time — never by making every caller
 * await a network-or-cache read just to learn "which films are curated."
 *
 * Deliberately January-specific rather than a generic per-event map: no
 * other registered event has (or needs) a remotely-configurable curated
 * list today, and a generic mechanism for a capability only one event
 * uses would be speculative complexity, not reuse.
 */
let januaryManifestCuratedFilmIds: string[] = [];

export function setJanuaryManifestCuratedFilmIds(filmIds: string[]): void {
  januaryManifestCuratedFilmIds = filmIds;
}

export function getJanuaryManifestCuratedFilmIds(): string[] {
  return januaryManifestCuratedFilmIds;
}
