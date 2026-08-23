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
 * disabled-event behaviour exactly — see `EventSwitcherSection`), nothing
 * in the registry is naturally available for this profile right now, the
 * profile already has this exact event active, or the profile already
 * dismissed this exact availability cycle.
 *
 * Deliberately silent on `manualActivationAllowed` events outside their
 * natural window — those have no "newly available" moment to announce and
 * stay reachable only through Settings, unchanged from Phase 5.
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
  if (!eventSettings.eventsEnabled) {
    return null;
  }

  const dismissals = await getEventDismissals(repos, params.profileId);

  for (const event of EVENT_DEFINITIONS) {
    if (eventSettings.activeEvent === event.id) {
      continue;
    }
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
