import { settleAndDiscardLocalDraft } from "@/application/drafts/local-draft-service";
import { getEffectiveEventDate } from "@/application/events/event-clock";
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
import { SystemClock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { PointsRepository } from "@/repositories/points-repository";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

type EventOptInRepos = {
  drafts: DraftRepository;
  watchlist: WatchlistRepository;
  history: HistoryRepository;
  settings: SettingsRepository;
  points: PointsRepository;
  profiles: ProfileRepository;
};

/**
 * Which event a click of the Settings "Events" toggle actually opts into —
 * the naturally-available one, if any (see `isEventAvailable`), otherwise
 * the first one that allows manual activation. No event name/id appears
 * here; this is data-driven from `EVENT_DEFINITIONS` alone, so a second
 * future event slots in without touching this function. `null` only when
 * the registry has nothing eligible at all (empty, or every entry forbids
 * manual activation while none is naturally available).
 *
 * `requestedEventId`, when given, opts into THAT specific event instead of
 * auto-picking one (see docs/product-spec.md, event system Phase 10 audit:
 * every registered event currently allows manual activation, so the
 * auto-pick fallback below always resolves to the first entry in
 * `EVENT_DEFINITIONS` — meaning Halloween/The Watchlist Frontier/Signal
 * from Beyond were completely unreachable through Settings' own "Opt In"
 * button, which displays a SPECIFIC event's name but, without this
 * parameter, always activated whichever event this function auto-picked
 * instead — silently diverging from what was shown). Still resolves
 * `manuallyEnabled` the same way: `false` only if the requested event is
 * naturally available right now, `true` otherwise — and `null` (fails
 * safely, same as an empty registry) for a stale/unknown id or one that
 * isn't naturally available and doesn't allow manual activation.
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
  if (naturallyAvailable) {
    return { event: naturallyAvailable, manuallyEnabled: false };
  }
  const manualCandidate = EVENT_DEFINITIONS.find(
    (event) => event.manualActivationAllowed,
  );
  return manualCandidate
    ? { event: manualCandidate, manuallyEnabled: true }
    : null;
}

export type BeginEventOptInResult =
  | { needsSayGoodbye: false; eventId: string | null }
  | {
      needsSayGoodbye: true;
      activeDraftId: string;
      eventId: string;
      manuallyEnabled: boolean;
    };

/**
 * The entry point for "opt into full event participation" (see
 * docs/product-spec.md, event system Phase 3, "SAY GOODBYE" and Phase 5):
 * never immediately overwrites an active draft. With no active draft,
 * this applies the opt-in immediately — the existing, unchanged path
 * (still a no-op if the registry has nothing eligible, exactly as before
 * any real event existed). With one, it applies NOTHING yet and reports
 * back which draft the Say Goodbye screen needs to show, and which event
 * opting in resolved to; the opt-in itself only completes once the caller
 * runs `confirmSayGoodbye`.
 *
 * `eventId`, when given, targets that SPECIFIC event (see
 * `resolveEventToOptInto`'s doc comment) — every caller that already
 * displays a specific event's name next to its own "Opt In" button (the
 * Settings available-event notice, the event introduction modal) passes
 * its id here, rather than trusting auto-pick to land on the same one it
 * displayed. Omitted only for the generic "Events" switch, which has no
 * specific event in mind and keeps the existing auto-pick behaviour.
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
  const hasActiveDraft = await repos.drafts.hasActiveDraft(params.profileId);

  if (!hasActiveDraft) {
    if (candidate) {
      await applyEventOptIn(repos, {
        profileId: params.profileId,
        eventId: candidate.event.id,
        manuallyEnabled: candidate.manuallyEnabled,
      });
    }
    return { needsSayGoodbye: false, eventId: candidate?.event.id ?? null };
  }

  if (!candidate) {
    return { needsSayGoodbye: false, eventId: null };
  }

  const activeDraft = await repos.drafts.getActiveOrExpiredDraft(
    params.profileId,
  );
  // hasActiveDraft just confirmed a status:"active" draft exists for this
  // profile, so getActiveOrExpiredDraft (which also considers "expired")
  // is guaranteed to find at least that one.
  return {
    needsSayGoodbye: true,
    activeDraftId: activeDraft!.id,
    eventId: candidate.event.id,
    manuallyEnabled: candidate.manuallyEnabled,
  };
}

/**
 * The actual event-settings mutation "opting in" performs — shared by the
 * no-active-draft path above and `confirmSayGoodbye` below, so there is
 * exactly one place this write happens. `EventDefinition.
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

/**
 * Confirms the Say Goodbye screen: settles and discards the outgoing
 * draft (see `settleAndDiscardLocalDraft` — generic/Lifetime reward
 * processing only, no event currency, no downgrade if it already
 * auto-archived), then resumes the event opt-in that was paused to show
 * this screen. The outgoing draft's `sourceEventId` is never touched.
 */
export async function confirmSayGoodbye(
  repos: EventOptInRepos,
  params: {
    profileId: string;
    draftId: string;
    eventId: string;
    manuallyEnabled: boolean;
  },
  deps: { clock?: Clock } = {},
): Promise<void> {
  const clock = deps.clock ?? new SystemClock();
  await settleAndDiscardLocalDraft(
    repos,
    { profileId: params.profileId, draftId: params.draftId },
    { clock },
  );
  await applyEventOptIn(repos, {
    profileId: params.profileId,
    eventId: params.eventId,
    manuallyEnabled: params.manuallyEnabled,
  });
}
