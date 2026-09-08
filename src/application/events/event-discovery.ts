import { getEffectiveEventDate } from "@/application/events/event-clock";
import {
  getEventEndingAcknowledgements,
  type EventEndingAcknowledgements,
} from "@/application/events/event-ending-acknowledgement-store";
import {
  getEventEndingStingerAcknowledgements,
  type EventEndingStingerAcknowledgements,
} from "@/application/events/event-ending-stinger-store";
import {
  getEventManualActivations,
  hasManualActivationEnded,
  resolvePinnedManualOccurrenceKey,
  type EventManualActivations,
} from "@/application/events/event-manual-activation-store";
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
  /**
   * Whether this profile has already dismissed this occurrence's
   * Event-ending experience (see `event-ending-acknowledgement-store.ts`,
   * docs/updates "EVENT SYSTEM — EVENT-OVER EXPERIENCE") — `false` for a
   * manual-only event with no occurrence key at all (there is nothing to
   * "end"). Only ever meaningful alongside `isOccurrenceExpired`/
   * `resolveEventEndingCandidate` below; every other consumer of this
   * type can ignore it exactly like they already ignore fields they don't
   * need.
   */
  endingAcknowledged: boolean;
  /**
   * Whether this profile has already dismissed this occurrence's SECOND
   * ending modal (see `EventEndingContent.stinger`,
   * `event-ending-stinger-store.ts`) — `false` for a manual-only event
   * with no occurrence key, and meaningless for the (majority of) events
   * that declare no stinger at all. Only ever read alongside
   * `endingAcknowledged` by `resolveEventEndingStingerCandidate` below.
   */
  endingStingerAcknowledged: boolean;
  /**
   * Whether a MANUAL activation of this event has run its course as of
   * `now` — the end of the occurrence it was activated against has passed
   * (see `event-manual-activation-store.ts`). Always `false` for an event
   * this profile never manually activated, and for one activated on a
   * build before that instant was recorded.
   *
   * This is what lets a manual activation reach an ending at all, while
   * still keeping a mid-season opt-in active for the rest of its run —
   * read by `isOccurrenceActiveNow`/`isOccurrenceExpired` below.
   */
  manualActivationEnded: boolean;
}

export interface EventDiscoveryResult {
  statuses: EventOccurrenceStatus[];
  /** Forwarded so a themed consumer (the intro modal, a nav icon) doesn't need a second `EventSettings` read of its own — purely a presentation concern, never consulted by either resolver function below. */
  eventVisualsEnabled: boolean;
  /**
   * Forwarded for the exact same reason as `eventVisualsEnabled` above —
   * one blanket per-profile flag (`EventSettings.eventsEnabled`), NOT
   * per-event, matching this field's existing, unchanged semantics (see
   * docs/updates, "HALLOWEEN PAGE REBUILD" §10: "Preserve existing Event
   * Gameplay semantics"). A consumer gating an event-specific action on
   * "is gameplay currently on" (e.g. Halloween's own create-Draft flow)
   * reads this directly rather than re-fetching `EventSettings` itself —
   * never consulted by `isOccurrenceActiveNow`/`resolveVisibleEventPages`,
   * which must keep working identically regardless of this flag (that's
   * the whole point of §10: turning Gameplay off must never remove the
   * joined page/nav).
   */
  eventsEnabled: boolean;
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
  const [
    participations,
    eventSettings,
    endingAcknowledgements,
    stingerAcknowledgements,
    manualActivations,
  ] = await Promise.all([
    getEventParticipations(repos, params.profileId),
    getEventSettings(repos, params.profileId),
    getEventEndingAcknowledgements(repos, params.profileId),
    getEventEndingStingerAcknowledgements(repos, params.profileId),
    getEventManualActivations(repos, params.profileId),
  ]);

  const statuses = EVENT_DEFINITIONS.map((event) =>
    resolveOccurrenceStatus(
      event,
      now,
      params.timezone,
      participations,
      endingAcknowledgements,
      stingerAcknowledgements,
      manualActivations,
      { manuallyEnabledEvents: eventSettings.manuallyEnabledEvents },
    ),
  );

  return {
    statuses,
    eventVisualsEnabled: eventSettings.eventVisualsEnabled,
    eventsEnabled: eventSettings.eventsEnabled,
    now,
  };
}

function resolveOccurrenceStatus(
  event: EventDefinition,
  now: Date,
  timezone: string,
  participations: EventParticipations,
  endingAcknowledgements: EventEndingAcknowledgements,
  stingerAcknowledgements: EventEndingStingerAcknowledgements,
  manualActivations: EventManualActivations,
  eventSettings: { manuallyEnabledEvents: string[] },
): EventOccurrenceStatus {
  const available = isEventAvailable(event.availability, now, timezone);
  // A manual activation PINS this event to the occurrence it was joined
  // under for as long as that activation still has something outstanding
  // (see `resolvePinnedManualOccurrenceKey`) — otherwise a run that
  // crosses a year boundary silently becomes a different, unanswered
  // occurrence mid-flight, taking the Event page and its ending with it.
  const occurrenceKey =
    resolvePinnedManualOccurrenceKey(manualActivations, event.id, {
      now,
      available,
      isEndingAcknowledged: (key) => endingAcknowledgements[key] === true,
    }) ?? computeOccurrenceKeyForEvent(event, now, timezone);
  const manuallyEnabled = eventSettings.manuallyEnabledEvents.includes(
    event.id,
  );
  const participation =
    occurrenceKey !== null
      ? resolveEventParticipationState(participations, occurrenceKey)
      : manuallyEnabled
        ? "joined"
        : "unanswered";
  const endingAcknowledged =
    occurrenceKey !== null
      ? (endingAcknowledgements[occurrenceKey] ?? false)
      : false;
  const endingStingerAcknowledged =
    occurrenceKey !== null
      ? (stingerAcknowledgements[occurrenceKey] ?? false)
      : false;
  return {
    event,
    occurrenceKey,
    available,
    manuallyEnabled,
    participation,
    endingAcknowledged,
    endingStingerAcknowledged,
    manualActivationEnded: hasManualActivationEnded(
      manualActivations,
      event.id,
      now,
    ),
  };
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
    (status.available ||
      (status.manuallyEnabled && !status.manualActivationEnded))
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

/**
 * A JOINED occurrence that has now concluded — see docs/updates, "EVENT
 * SYSTEM — EVENT-OVER EXPERIENCE" §1: "ACTIVE -> EXPIRED." The exact
 * inverse of `isOccurrenceActiveNow`, so an occurrence is never both at
 * once: a natural join concludes when its window closes, and a manual
 * activation when its own recorded run ends
 * (`event-manual-activation-store.ts`).
 *
 * Manual activations USED to be excluded outright here, which was the
 * only way to stop one expiring the instant it was created (it is keyed
 * to an occurrence whose window has typically already closed). The cost
 * was that a manually activated event never reached its Event-over
 * experience at all — now fixed by comparing against the activation's own
 * recorded end instead of ignoring it.
 */
export function isOccurrenceExpired(status: EventOccurrenceStatus): boolean {
  return (
    status.participation === "joined" &&
    !status.available &&
    (!status.manuallyEnabled || status.manualActivationEnded)
  );
}

/**
 * Which event's Event-over/ending experience should show right now, if
 * any — see docs/updates, "EVENT SYSTEM — EVENT-OVER EXPERIENCE" §4/§6:
 * the FIRST (registry order) event whose CURRENT occurrence this profile
 * joined has expired, whose ending is `enabled`, and hasn't already been
 * acknowledged. A manual-only event (`occurrenceKey === null`) is never
 * offered here (same reasoning as `resolveEventIntroCandidate` — there is
 * no occurrence to key acknowledgement against). Declined/unanswered/
 * non-participant occurrences never qualify — only `participation ===
 * "joined"` does, via `isOccurrenceExpired`.
 */
export function resolveEventEndingCandidate(
  statuses: EventOccurrenceStatus[],
): (EventOccurrenceStatus & { occurrenceKey: string }) | null {
  const candidate = statuses.find(
    (status) =>
      status.occurrenceKey !== null &&
      Boolean(status.event.ending?.enabled) &&
      isOccurrenceExpired(status) &&
      !status.endingAcknowledged,
  );
  return candidate
    ? { ...candidate, occurrenceKey: candidate.occurrenceKey! }
    : null;
}

/**
 * Which event's SECOND ending modal should show right now, if any (see
 * `EventEndingContent.stinger`, docs/updates "FDRAFT UPDATE 1 — CHRISTMAS
 * DRAFT DIFFICULTIES + VISUAL POLISH" §16) — the exact same eligibility as
 * `resolveEventEndingCandidate` with two extra conditions: the event must
 * actually declare a `stinger`, the FIRST stage must already be
 * acknowledged, and this stage must not be. Registry order, first match
 * wins, same as every other resolver here.
 *
 * Deliberately a separate function rather than extra state threaded
 * through the first one: the two stages are independently persisted, so
 * "which goodbye is showing" and "which sting is showing" are genuinely
 * separate questions, and an event with no stinger can never be a
 * candidate here at all.
 */
export function resolveEventEndingStingerCandidate(
  statuses: EventOccurrenceStatus[],
): (EventOccurrenceStatus & { occurrenceKey: string }) | null {
  const candidate = statuses.find(
    (status) =>
      status.occurrenceKey !== null &&
      Boolean(status.event.ending?.enabled) &&
      Boolean(status.event.ending?.stinger) &&
      isOccurrenceExpired(status) &&
      status.endingAcknowledged &&
      !status.endingStingerAcknowledged,
  );
  return candidate
    ? { ...candidate, occurrenceKey: candidate.occurrenceKey! }
    : null;
}
