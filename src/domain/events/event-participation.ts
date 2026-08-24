/**
 * An explicit per-Event-occurrence participation lifecycle (see
 * docs/updates, "EVENT LIFECYCLE REPAIR" — root cause: the previous model
 * inferred "is this event's page/nav visible" from `EventSettings.
 * activeEvent`, a single mutable slot ALSO consumed by unrelated draft-
 * tagging/reward-currency code, that never distinguished "never asked,"
 * "said yes," and "said no," and was never reset between annual
 * occurrences). Exactly three states — never a boolean "has seen the
 * modal" flag, which loses the "joined" vs. "declined" distinction a
 * boolean can't express.
 */
export type EventParticipationState = "unanswered" | "joined" | "declined";

/**
 * A stable identifier for ONE annual (or one-off) occurrence of an event —
 * e.g. `"halloween:2026"` — built from the event's own id and an
 * occurrence id (see `getAvailabilityCycleId`, `event-availability.ts`,
 * which already computes the right occurrence id for every
 * `EventAvailability` shape: the profile's local year for a recurring
 * window, or the fixed window's own `startsAt` for a one-off). Never
 * inferred from a route, a Draft's existence, or which event happens to be
 * "selected" — this is the ONLY key participation is ever recorded or read
 * against.
 */
export function buildEventOccurrenceKey(
  eventId: string,
  occurrenceId: string,
): string {
  return `${eventId}:${occurrenceId}`;
}

/**
 * The one place a participation lookup happens — an occurrence with no
 * recorded entry is `"unanswered"` by construction (never `undefined`),
 * which is exactly what makes a brand-new annual occurrence "begin
 * unanswered" for free: `halloween:2027`'s key simply doesn't exist yet in
 * the map, regardless of what `halloween:2026` was ever set to.
 */
export function resolveEventParticipationState(
  participations: Record<string, EventParticipationState>,
  occurrenceKey: string,
): EventParticipationState {
  return participations[occurrenceKey] ?? "unanswered";
}
