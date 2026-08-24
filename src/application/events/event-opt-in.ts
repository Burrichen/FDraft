import { getEffectiveEventDate } from "@/application/events/event-clock";
import { computeOccurrenceKeyForEvent } from "@/application/events/event-discovery";
import { setEventParticipation } from "@/application/events/event-participation-store";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import { isEventAvailable } from "@/domain/events/event-availability";
import type { EventDefinition } from "@/domain/events/event-definition";
import {
  EVENT_DEFINITIONS,
  getEventDefinition,
} from "@/domain/events/event-registry";
import type { Clock } from "@/domain/time/clock";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";

type EventOptInRepos = {
  settings: SettingsRepository;
  profiles: ProfileRepository;
};

/**
 * Which event a Join action actually opts into.
 *
 * With an explicit `requestedEventId` (every current caller — the
 * Settings available-events list and the event introduction modal both
 * only ever offer a Join button for an event `isEventAvailable` already
 * confirmed, so this manual-activation fallback is unreachable through
 * today's UI, but is kept for any future or direct caller that legitimately
 * needs to activate a `manualActivationAllowed` event with no natural
 * window at all, e.g. The Watchlist Frontier/Signal from Beyond):
 * naturally-available takes priority; failing that, falls back to a
 * manual activation IF the requested event allows it.
 *
 * With NO explicit id (a generic "opt into whatever's currently running"
 * call): ONLY ever resolves a naturally-available event now (see
 * docs/updates, "PROMPT B2.1 — DUAL DRAFT ARCHITECTURE + EVENT ROUTING/
 * SETTINGS FIXES" §4, "Do not allow normal users to force inactive
 * Events") — no manual-activation fallback at all. The old fallback to
 * "the first manually-activatable event in registry order" existed solely
 * for the generic Settings "Events" toggle, which no longer exists
 * (replaced by explicit per-event Join buttons, each of which already
 * targets a specific, naturally-available event by id).
 *
 * Admin Mode's simulated date flows through the same `getEffectiveEventDate`
 * this reads its `now` from, so an Admin-simulated window counts as
 * "naturally available" too, with no separate "force" affordance needed
 * (see §4, "ADMIN EXCEPTION") — everything here flows through the one
 * central EventClock. No event name/id appears here; entirely data-driven
 * from `EVENT_DEFINITIONS`, so a future event needs no changes here.
 */
function resolveEventToOptInto(
  now: Date,
  timezone: string,
  requestedEventId?: string,
): { event: EventDefinition; manuallyEnabled: boolean } | null {
  if (requestedEventId) {
    const requested = EVENT_DEFINITIONS.find(
      (event) => event.id === requestedEventId,
    );
    if (!requested) {
      return null;
    }
    const naturallyAvailable = isEventAvailable(
      requested.availability,
      now,
      timezone,
    );
    if (!naturallyAvailable && !requested.manualActivationAllowed) {
      return null;
    }
    return { event: requested, manuallyEnabled: !naturallyAvailable };
  }

  const naturallyAvailable = EVENT_DEFINITIONS.find((event) =>
    isEventAvailable(event.availability, now, timezone),
  );
  return naturallyAvailable
    ? { event: naturallyAvailable, manuallyEnabled: false }
    : null;
}

export interface BeginEventOptInResult {
  eventId: string | null;
}

/**
 * Opts a profile into full event participation (see docs/product-spec.md,
 * event system Phase 5; revised by "PROMPT B2.1" §1/§4 — this no longer
 * ever touches drafts, and no longer has a "Say Goodbye" detour). A
 * profile's normal Draft (if any) is completely unaffected by opting into
 * an event — the two are fully independent (see docs/updates, "DUAL DRAFT
 * ARCHITECTURE"), so there is nothing here to check or pause for.
 *
 * `eventId`, when given, targets that SPECIFIC event (see
 * `resolveEventToOptInto`'s doc comment). Omitted only for a generic
 * "opt into whatever's currently running" call. A no-op (returns
 * `{ eventId: null }`, no settings change) whenever nothing eligible is
 * currently available.
 */
export async function beginEventOptIn(
  repos: EventOptInRepos,
  params: { profileId: string; timezone: string; eventId?: string },
  deps: { clock?: Clock } = {},
): Promise<BeginEventOptInResult> {
  const now = await getEffectiveEventDate(repos, params.profileId, {
    clock: deps.clock,
  });
  const candidate = resolveEventToOptInto(now, params.timezone, params.eventId);
  if (!candidate) {
    return { eventId: null };
  }

  await applyEventOptIn(repos, {
    profileId: params.profileId,
    eventId: candidate.event.id,
    manuallyEnabled: candidate.manuallyEnabled,
  });

  // Records the CURRENT occurrence as joined — the one thing an event's
  // page/nav visibility and introduction modal ever read (see
  // `event-discovery.ts`), entirely separate from the `EventSettings`
  // write above (which only ever governs gameplay/reward-currency
  // semantics, see docs/updates, "EVENT LIFECYCLE REPAIR" §9). A manual-
  // only event with no natural window at all (`occurrenceKey === null`)
  // has nothing to record here — `EventSettings.manuallyEnabledEvents`,
  // just written above, is what `event-discovery.ts` reads for that case
  // instead.
  const occurrenceKey = computeOccurrenceKeyForEvent(
    candidate.event,
    now,
    params.timezone,
  );
  if (occurrenceKey !== null) {
    await setEventParticipation(
      repos,
      params.profileId,
      occurrenceKey,
      "joined",
    );
  }

  return { eventId: candidate.event.id };
}

/**
 * Records that the profile pressed "Nah" on an event's introduction modal
 * for exactly this occurrence (see docs/updates, "EVENT LIFECYCLE REPAIR"
 * §5/§7) — never a permanent, all-time suppression, and never touches
 * `EventSettings` at all (there is nothing to "leave"; the profile was
 * never joined). The next occurrence of a recurring event (a new year) is
 * a different key and begins unanswered regardless.
 */
export async function declineEventOccurrence(
  repos: { settings: SettingsRepository },
  params: { profileId: string; occurrenceKey: string },
): Promise<void> {
  await setEventParticipation(
    repos,
    params.profileId,
    params.occurrenceKey,
    "declined",
  );
}

/**
 * Leaving an event a profile is currently joined to (Settings' "Event
 * Gameplay" toggle) — bundles two independent effects, matching docs/
 * updates, "EVENT LIFECYCLE REPAIR" §9's split: the `EventSettings` write
 * (unchanged from before this phase) governs gameplay/reward-currency
 * semantics going forward, while the occurrence participation write is
 * the ONLY thing that makes the event's page/nav actually disappear (see
 * `resolveVisibleEventPages`). `occurrenceKey` is `null` for a manual-only
 * event with no natural window — for that case, removing it from
 * `manuallyEnabledEvents` (via the `EventSettings` write) is already the
 * complete "un-join" `event-discovery.ts` reads back.
 */
export async function leaveEventOccurrence(
  repos: EventOptInRepos,
  params: { profileId: string; eventId: string; occurrenceKey: string | null },
): Promise<void> {
  const current = await getEventSettings(repos, params.profileId);
  await setEventSettings(repos, params.profileId, {
    ...current,
    eventsEnabled:
      current.activeEvent === params.eventId ? false : current.eventsEnabled,
    activeEvent:
      current.activeEvent === params.eventId ? null : current.activeEvent,
    // `manuallyEnabledEvents` is preserved, not wiped — it's this profile's
    // historical "have I ever manually activated this" record (consulted
    // for reward-currency downgrade logic elsewhere), not a live
    // membership list; leaving doesn't erase history any more than it did
    // before this phase.
  });
  if (params.occurrenceKey !== null) {
    await setEventParticipation(
      repos,
      params.profileId,
      params.occurrenceKey,
      "declined",
    );
  }
}

/**
 * The actual event-settings mutation "opting in" performs — the one place
 * this write happens, shared by `beginEventOptIn` above. `EventDefinition.
 * enableVisualsOnOptIn` (see docs/updates, "PROMPT 18 — EVENT PAGES +
 * HALLOWEEN LIFECYCLE") force-enables `eventVisualsEnabled` for an event
 * that opts into that — today only Halloween — while every other event's
 * opt-in leaves it exactly as it was, preserving the pre-existing "opt-in
 * and visuals are fully decoupled" behaviour.
 */
export async function applyEventOptIn(
  repos: { settings: SettingsRepository },
  params: { profileId: string; eventId: string; manuallyEnabled: boolean },
): Promise<void> {
  const current = await getEventSettings(repos, params.profileId);
  const enableVisualsByDefault =
    getEventDefinition(params.eventId)?.enableVisualsOnOptIn ?? false;
  await setEventSettings(repos, params.profileId, {
    ...current,
    eventsEnabled: true,
    activeEvent: params.eventId,
    eventVisualsEnabled: enableVisualsByDefault || current.eventVisualsEnabled,
    manuallyEnabledEvents:
      params.manuallyEnabled &&
      !current.manuallyEnabledEvents.includes(params.eventId)
        ? [...current.manuallyEnabledEvents, params.eventId]
        : current.manuallyEnabledEvents,
  });
}
