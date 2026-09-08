import { getEffectiveEventDate } from "@/application/events/event-clock";
import { computeOccurrenceKeyForEvent } from "@/application/events/event-discovery";
import { setEventParticipation } from "@/application/events/event-participation-store";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import { setEventManualActivation } from "@/application/events/event-manual-activation-store";
import { rollSingleFilmEventDraft } from "@/application/events/single-film-event-draft";
import {
  isEventAvailable,
  resolveUpcomingOccurrenceEnd,
} from "@/domain/events/event-availability";
import type { EventDefinition } from "@/domain/events/event-definition";
import {
  EVENT_DEFINITIONS,
  getEventDefinition,
} from "@/domain/events/event-registry";
import type { Rng } from "@/domain/shared/rng";
import type { Clock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { FilmRepository } from "@/repositories/film-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

type EventOptInRepos = {
  settings: SettingsRepository;
  profiles: ProfileRepository;
};

/**
 * `EventOptInRepos` plus everything `rollSingleFilmEventDraft` needs — a
 * SUPERSET, required only by `beginEventOptIn` (the one join path that can
 * create an Event Draft, see `EventDefinition.singleFilmDraft`). Every
 * other function in this file keeps its own narrower repos type, so
 * `declineEventOccurrence`/`applyEventOptIn` are still callable with
 * nothing but a settings repository.
 */
type BeginEventOptInRepos = EventOptInRepos & {
  drafts: DraftRepository;
  films: FilmRepository;
  history: HistoryRepository;
  watchlist: WatchlistRepository;
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
  /**
   * The Draft this join rolled (or found already rolled) for a
   * `EventDefinition.singleFilmDraft` event — `null` for every other
   * event, and for a single-film event whose curated pool had nothing
   * usable (in which case `rollError` explains why). Never an error the
   * join itself fails on: opting in is what the profile asked for, and it
   * has genuinely succeeded either way (see `beginEventOptIn`'s own doc
   * comment).
   */
  singleFilmDraftId: string | null;
  /** Why the single-film roll produced no Draft, for a caller that wants to surface it. `null` when there was nothing to roll, or the roll succeeded. */
  rollError: string | null;
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
 *
 * ONE exception to "this never touches drafts" (see docs/updates, "FDRAFT
 * UPDATE 1 — F* YOU, IT'S JANUARY: SIMPLE EVENT MECHANICS" §3): an event
 * declaring `EventDefinition.singleFilmDraft` has no builder at all — its
 * whole Draft IS one random curated film — so joining rolls and persists
 * it immediately, right here, rather than leaving the profile on a page
 * with a "Create Draft" step it deliberately doesn't have. Read
 * generically off the definition; no event id appears here. The roll is
 * idempotent per occurrence (`rollSingleFilmEventDraft`), so re-joining
 * after leaving, or any repeat call, never rolls a second film. A roll
 * that finds nothing usable is reported through `rollError` and never
 * fails the join itself — the profile asked to opt in, and they have.
 */
export async function beginEventOptIn(
  repos: BeginEventOptInRepos,
  params: { profileId: string; timezone: string; eventId?: string },
  deps: { clock?: Clock; rng?: Rng } = {},
): Promise<BeginEventOptInResult> {
  const now = await getEffectiveEventDate(repos, params.profileId, {
    clock: deps.clock,
  });
  const candidate = resolveEventToOptInto(now, params.timezone, params.eventId);
  if (!candidate) {
    return { eventId: null, singleFilmDraftId: null, rollError: null };
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

  // A MANUAL activation records when it runs until — the end of this
  // event's next natural occurrence as of right now (see docs/updates,
  // "FDRAFT UPDATE 1 — JANUARY / HALLOWEEN / CHRISTMAS REGRESSION"). That
  // is what eventually concludes it and lets its Event-over experience
  // show, instead of the activation persisting indefinitely with nothing
  // to end it. A NATURAL join records nothing here: its own window is
  // already the thing that concludes it.
  if (candidate.manuallyEnabled && occurrenceKey !== null) {
    const endsAt = resolveUpcomingOccurrenceEnd(
      candidate.event.availability,
      now,
      params.timezone,
    );
    if (endsAt) {
      await setEventManualActivation(repos, {
        profileId: params.profileId,
        eventId: candidate.event.id,
        endsAt,
        // Pinned to the occurrence just recorded as joined above, so a
        // run that crosses a year boundary keeps pointing at it.
        occurrenceKey,
      });
    }
  }

  if (!candidate.event.singleFilmDraft) {
    return {
      eventId: candidate.event.id,
      singleFilmDraftId: null,
      rollError: null,
    };
  }

  const roll = await rollSingleFilmEventDraft(
    repos,
    {
      profileId: params.profileId,
      timezone: params.timezone,
      eventId: candidate.event.id,
      sourceEventManuallyEnabled: candidate.manuallyEnabled,
    },
    // `now` is the Admin-aware effective date this whole join was decided
    // against — reused rather than resolved a second time, so the Draft's
    // occurrence year/deadline can never disagree with the participation
    // record just written above by a few milliseconds (or by an Admin
    // override changing in between).
    { clock: deps.clock, rng: deps.rng, effectiveNow: now },
  );

  return {
    eventId: candidate.event.id,
    singleFilmDraftId: roll.ok ? roll.draftId : null,
    rollError: roll.ok ? null : roll.message,
  };
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
