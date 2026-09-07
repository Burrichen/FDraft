import { CHRISTMAS_EVENT_ID, HALLOWEEN_EVENT_ID } from "./event-registry";

/**
 * Which curated categories each event's One At A Time builder offers (see
 * docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" §5/§7/§8)
 * — the ONE place this is declared, imported by every entry point
 * (Halloween's own creation view, Christmas's, and the generic `/drafts/
 * new` → One At A Time hand-off) rather than duplicated per call site.
 *
 * Deliberately NOT read from `EventDefinition.contentPools` — that field
 * predates this feature and means something else for January (its own
 * ADDITIVE-eligibility curated list, not a real drawable category — see
 * `attemptEventOneAtATimeChallenge`'s identical note). `null` (January)
 * means no category step at all; the event's whole canonical eligible
 * pool is the only "category."
 */
export const EVENT_ONE_AT_A_TIME_CATEGORIES: Record<
  string,
  readonly { key: string; label: string }[] | null
> = {
  [HALLOWEEN_EVENT_ID]: [
    { key: "horror", label: "Horror" },
    { key: "kitsch", label: "Kitsch" },
  ],
  [CHRISTMAS_EVENT_ID]: [
    { key: "classic", label: "Classic" },
    { key: "adjacent", label: "Adjacent" },
  ],
};

/** `undefined` for an unregistered event id (never reached in practice — every real caller already knows this is a real event) is treated the same as `null` (no categories) by every consumer. */
export function getEventOneAtATimeCategories(
  eventId: string,
): readonly { key: string; label: string }[] | null {
  return EVENT_ONE_AT_A_TIME_CATEGORIES[eventId] ?? null;
}
