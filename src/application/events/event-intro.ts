import { getEffectiveEventDate } from "@/application/events/event-clock";
import {
  getAvailabilityCycleId,
  isEventAvailable,
} from "@/domain/events/event-availability";
import type { EventDefinition } from "@/domain/events/event-definition";
import { EVENT_DEFINITIONS } from "@/domain/events/event-registry";
import type { Clock } from "@/domain/time/clock";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";
import { getEventDismissals } from "./event-dismissal-store";
import { getEventSettings } from "./event-settings-store";

export interface EventIntroCandidate {
  event: EventDefinition;
  /** The occurrence "Nah" would record a dismissal against — see `getAvailabilityCycleId`. `null` only for an event with no natural availability window at all, which can't reach here anyway (see below). */
  cycleId: string | null;
  /** Forwarded so the modal can resolve the event's visual presentation (see `resolveEventVisualThemeId`) without a second `EventSettings` read of its own — purely a presentation concern, never consulted by this function's own eligibility decision above. */
  eventVisualsEnabled: boolean;
}

/**
 * Which event's introduction modal (see docs/product-spec.md, event
 * system Phase 6: "the modal is now the primary way users discover a
 * newly-started event, not Settings") should show right now, if any.
 * Entirely data-driven from `EVENT_DEFINITIONS`, `EventSettings`, and
 * per-event dismissal state — no event id/name appears here, so a second
 * future event is covered automatically.
 *
 * `null` whenever: the Settings "Events" switch is off (preserves existing
 * disabled-event behaviour exactly — see `EventSwitcherSection`), the
 * profile is already active in ANY event, nothing in the registry is
 * naturally available for this profile right now, or the profile already
 * dismissed this exact availability cycle.
 *
 * Deliberately silent on `manualActivationAllowed` events outside their
 * natural window — those have no "newly available" moment to announce and
 * stay reachable only through Settings, unchanged from Phase 5.
 *
 * BUGFIX (see docs/updates, "PROMPT B2.1 — DUAL DRAFT ARCHITECTURE +
 * EVENT ROUTING/SETTINGS FIXES" §2): the pre-existing version of this
 * function only skipped the loop entry matching `activeEvent` itself,
 * meaning a profile already opted into one event (e.g. Halloween) could
 * still be offered ANOTHER naturally-available event's intro (e.g.
 * January) — the modal is mounted globally (`EventIntroDialog`, in
 * `AppShell`), so this surfaced as a completely unrelated event's name/
 * header popping up over whichever page the profile was actually on (most
 * visibly Halloween's own page), and accepting it would silently
 * overwrite `activeEvent` out from under the event the profile was
 * already in. The root cause was genuinely "whichever event happened to
 * be registered/iterated first that also happened to be naturally
 * available" — `EVENT_DEFINITIONS` is iterated in a fixed declaration
 * order (January first), so January was the one this manifested with in
 * practice. The fix is the early return below: once a profile has ANY
 * active event, nothing else is ever offered until they leave it.
 */
export async function resolveEventIntroToShow(
  repos: { settings: SettingsRepository; profiles: ProfileRepository },
  params: { profileId: string; timezone: string },
  deps: { clock?: Clock } = {},
): Promise<EventIntroCandidate | null> {
  const now = await getEffectiveEventDate(repos, params.profileId, {
    clock: deps.clock,
  });

  const eventSettings = await getEventSettings(repos, params.profileId);
  if (!eventSettings.eventsEnabled || eventSettings.activeEvent) {
    return null;
  }

  const dismissals = await getEventDismissals(repos, params.profileId);

  for (const event of EVENT_DEFINITIONS) {
    if (!isEventAvailable(event.availability, now, params.timezone)) {
      continue;
    }
    const cycleId = getAvailabilityCycleId(
      event.availability,
      now,
      params.timezone,
    );
    if (cycleId !== null && dismissals[event.id] === cycleId) {
      continue;
    }
    return {
      event,
      cycleId,
      eventVisualsEnabled: eventSettings.eventVisualsEnabled,
    };
  }

  return null;
}
