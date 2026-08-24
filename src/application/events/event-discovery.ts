import { getEffectiveEventDate } from "@/application/events/event-clock";
import {
  getEventParticipations,
  type EventParticipations,
} from "@/application/events/event-participation-store";
import { getEventSettings } from "@/application/events/event-settings-store";
import {
  getAvailabilityCycleId,
  isEventAvailable,
} from "@/domain/events/event-availability";
import type { EventDefinition } from "@/domain/events/event-definition";
import {
  buildEventOccurrenceKey,
  resolveEventParticipationState,
  type EventParticipationState,
} from "@/domain/events/event-participation";
import { EVENT_DEFINITIONS } from "@/domain/events/event-registry";
import type { Clock } from "@/domain/time/clock";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";

type EventDiscoveryRepos = {
  settings: SettingsRepository;
  profiles: ProfileRepository;
};

/**
 * The stable occurrence key an event's `now` currently falls into, or
 * `null` for an event with no natural availability window at ALL (manual-
 * only, e.g. The Watchlist Frontier/Signal from Beyond — there is no
 * annual "occurrence" to key participation against). Shared by
 * `getEventDiscovery` below and `beginEventOptIn`/`declineEventOccurrence`
 * (`event-opt-in.ts`) so there is exactly one place that turns "this
 * event, right now" into a key — never duplicated, never re-derived from a
 * route or a Draft.
 */
export function computeOccurrenceKeyForEvent(
  event: Pick<EventDefinition, "id" | "availability">,
  now: Date,
  timezone: string,
): string | null {
  const cycleId = getAvailabilityCycleId(event.availability, now, timezone);
  return cycleId !== null ? buildEventOccurrenceKey(event.id, cycleId) : null;
}

/**
 * Everything about ONE event, right now (see docs/updates, "EVENT
 * LIFECYCLE REPAIR" §1/§3) — the single unit `resolveVisibleEventPages`
 * and `resolveEventIntroCandidate` below are both built from. Entirely
 * data-driven from `EVENT_DEFINITIONS`; no event id/name appears in either
 * of those functions.
 */
export interface EventOccurrenceStatus {
  event: EventDefinition;
  /** `null` only for a manual-only event with no natural window at all — see `computeOccurrenceKeyForEvent`. */
  occurrenceKey: string | null;
  /** Whether `event.availability` is naturally active right now — `isEventAvailable`, evaluated against the Admin-aware `getEffectiveEventDate` (so an Admin-simulated window counts identically, see §6). */
  available: boolean;
  /**
   * Whether this event was ever recorded in `EventSettings.
   * manuallyEnabledEvents` — i.e. joined OUTSIDE its natural window (only
   * possible for an event with `manualActivationAllowed: true`, e.g.
   * January). See `resolveVisibleEventPages`'s doc comment for why this
   * matters: a manual join is a deliberate "stay active the rest of the
   * year" participation, not a seasonal one, so it must NOT be hidden the
   * moment `available` goes false the way a natural-only join (Halloween)
   * correctly is.
   */
  manuallyEnabled: boolean;
  /**
   * The profile's recorded response for `occurrenceKey`, or — for a
   * manual-only event with no occurrence key — derived from
   * `EventSettings.manuallyEnabledEvents` instead (`"joined"` once
   * manually enabled, `"unanswered"` otherwise; never `"declined"` through
   * this path, matching that this kind of event has never had an
   * introduction modal to decline in the first place).
   */
  participation: EventParticipationState;
}

export interface EventDiscoveryResult {
  statuses: EventOccurrenceStatus[];
  /** Forwarded so a themed consumer (the intro modal, a nav icon) doesn't need a second `EventSettings` read of its own — purely a presentation concern, never consulted by either resolver function below. */
  eventVisualsEnabled: boolean;
  /** The Admin-aware `getEffectiveEventDate` this whole read was computed against — forwarded so a consumer needing "now" for its own event-window display (e.g. "Event ends <date>", a time-progress bar) doesn't need a second, separately-timed `getEffectiveEventDate` call that could theoretically disagree with the `available`/`participation` values above by a few milliseconds. */
  now: Date;
}

/**
 * THE Global Event Discovery read (see docs/updates, "EVENT LIFECYCLE
 * REPAIR" §4) — computes, for every registered event, whether it's
 * naturally available right now and what the profile's participation is
 * for whichever occurrence that represents. One shared read every
 * consumer (navigation, the introduction modal, an event's own page,
 * Settings) is meant to go through via `EventDiscoveryProvider`
 * (`components/events/event-discovery-provider.tsx`) rather than each
 * re-implementing this query independently against stale, uncoordinated
 * local state — that duplication was the actual root cause of the nav tab
 * only appearing after a manual reload (see the provider's own doc
 * comment for the full explanation).
 */
export async function getEventDiscovery(
  repos: EventDiscoveryRepos,
  params: { profileId: string; timezone: string },
  deps: { clock?: Clock } = {},
): Promise<EventDiscoveryResult> {
  const now = await getEffectiveEventDate(repos, params.profileId, {
    clock: deps.clock,
  });
  const [participations, eventSettings] = await Promise.all([
    getEventParticipations(repos, params.profileId),
    getEventSettings(repos, params.profileId),
  ]);

  const statuses = EVENT_DEFINITIONS.map((event) =>
    resolveOccurrenceStatus(event, now, params.timezone, participations, {
      manuallyEnabledEvents: eventSettings.manuallyEnabledEvents,
    }),
  );

  return {
    statuses,
    eventVisualsEnabled: eventSettings.eventVisualsEnabled,
    now,
  };
}

function resolveOccurrenceStatus(
  event: EventDefinition,
  now: Date,
  timezone: string,
  participations: EventParticipations,
  eventSettings: { manuallyEnabledEvents: string[] },
): EventOccurrenceStatus {
  const available = isEventAvailable(event.availability, now, timezone);
  const occurrenceKey = computeOccurrenceKeyForEvent(event, now, timezone);
  const manuallyEnabled = eventSettings.manuallyEnabledEvents.includes(
    event.id,
  );
  const participation =
    occurrenceKey !== null
      ? resolveEventParticipationState(participations, occurrenceKey)
      : manuallyEnabled
        ? "joined"
        : "unanswered";
  return { event, occurrenceKey, available, manuallyEnabled, participation };
}

/**
 * Whether a JOINED occurrence should currently be presented as active —
 * shared by `resolveVisibleEventPages` below and every page/section that
 * needs the exact same "is this really live for this profile right now"
 * answer (an event's own page, `HauntedSection`). Requires either real
 * natural availability, OR that this was a manual activation
 * (`EventDefinition.manualActivationAllowed`) — the two are NOT
 * equivalent: Halloween (`manualActivationAllowed: false`) can only ever
 * be joined DURING its natural window, so once that window closes there's
 * nothing seasonal left to show (§8's "Event expiry"); January
 * (`manualActivationAllowed: true`) can be joined any time of year and is
 * DELIBERATELY meant to stay active the rest of the year once manually
 * activated (downgraded to Lifetime Points) — gating it on `available`
 * too would have hidden that entire pre-existing feature for 358 days a
 * year.
 */
export function isOccurrenceActiveNow(status: EventOccurrenceStatus): boolean {
  return (
    status.participation === "joined" &&
    (status.available || status.manuallyEnabled)
  );
}

/**
 * Which page-bearing events should currently be presented as an active
 * seasonal destination — see docs/updates, "EVENT LIFECYCLE REPAIR" §2/§3:
 * "JOINED EVENT → Event page/navigation exists," never "a Draft exists"
 * or "this route was visited." Once a natural-only join's window closes,
 * the tab disappears even though the occurrence stays recorded `"joined"`
 * forever (nothing is ever deleted) — no separate expiry flag or cleanup
 * job exists or is needed, because a NEW occurrence next year is a
 * different key that starts `"unanswered"` regardless of what happened
 * this year. See `isOccurrenceActiveNow` for why a MANUAL join is exempt
 * from that same closing-window check.
 */
export function resolveVisibleEventPages(
  statuses: EventOccurrenceStatus[],
): EventOccurrenceStatus[] {
  return statuses.filter(
    (status) => status.event.page && isOccurrenceActiveNow(status),
  );
}

/**
 * Which event's introduction modal should show right now, if any — see
 * docs/updates, "EVENT LIFECYCLE REPAIR" §4/§5: the FIRST naturally-
 * available event (registry declaration order, same iteration order the
 * pre-existing implementation used) whose CURRENT occurrence is genuinely
 * `"unanswered"`. A manual-only event (`occurrenceKey === null`) is never
 * offered here — it has no "newly available" moment to announce, matching
 * its pre-existing behaviour.
 *
 * Deliberately does NOT special-case "the profile is already joined to a
 * DIFFERENT event" — that early-return existed under the old single-
 * `activeEvent`-slot model specifically because opting into a second event
 * would silently overwrite the first one's slot; occurrence-keyed
 * participation has no such shared slot to corrupt, so a profile already
 * joined to Halloween can still be offered January's intro once January's
 * own occurrence naturally opens (or vice versa) — consistent with the
 * dual-draft architecture already allowing both to run at once.
 */
export function resolveEventIntroCandidate(
  statuses: EventOccurrenceStatus[],
): (EventOccurrenceStatus & { occurrenceKey: string }) | null {
  const candidate = statuses.find(
    (status) =>
      status.occurrenceKey !== null &&
      status.available &&
      status.participation === "unanswered",
  );
  return candidate
    ? { ...candidate, occurrenceKey: candidate.occurrenceKey! }
    : null;
}
