/**
 * The current resolved curated-category local film ids for EVERY event
 * with `EventDefinition.contentPools` (see docs/updates, "FDRAFT UPDATE 1
 * — EVENT ONE AT A TIME DRAFTING") — a generic, event-id-keyed sibling of
 * `halloween-manifest-overlay.ts`. That older file stays untouched (it
 * still feeds the pre-existing bulk-generation `createHalloweenLocalDraft`
 * flow); this one is read by the new, generic Event category candidate
 * resolver (`resolve-event-category-candidates.ts`), so a single
 * implementation serves Halloween AND Christmas (and any future
 * category-based event) instead of one bespoke overlay per event.
 *
 * Populated once by `loadEventCategoryFilmContent` (app start) and read
 * synchronously thereafter — a plain module-level mutable store, the same
 * "resolved once, available everywhere without a repeated live fetch"
 * pattern every other manifest overlay in this codebase already uses.
 */
export type EventCategoryFilmIds = Record<string, string[]>;

let currentEventCategoryFilmIds: Record<string, EventCategoryFilmIds> = {};

export function setEventCategoryFilmIds(
  eventId: string,
  pools: EventCategoryFilmIds,
): void {
  currentEventCategoryFilmIds = {
    ...currentEventCategoryFilmIds,
    [eventId]: pools,
  };
}

/** `{}` for an event with no resolved categories yet (or none declared at all). */
export function getEventCategoryFilmIds(eventId: string): EventCategoryFilmIds {
  return currentEventCategoryFilmIds[eventId] ?? {};
}

/** Test-only escape hatch — module-level state persists across tests in the same process otherwise. */
export function resetEventCategoryFilmIdsForTests(): void {
  currentEventCategoryFilmIds = {};
}
