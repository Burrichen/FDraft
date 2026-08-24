import {
  getEventDiscovery,
  resolveEventIntroCandidate,
} from "@/application/events/event-discovery";
import type { EventDefinition } from "@/domain/events/event-definition";
import type { Clock } from "@/domain/time/clock";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";

export interface EventIntroCandidate {
  event: EventDefinition;
  /** The occurrence "Nah" records a decline against (see `declineEventOccurrence`, `event-opt-in.ts`) — never `null` here, since `resolveEventIntroCandidate` only ever returns an occurrence-bearing event. */
  occurrenceKey: string;
  /** Forwarded so the modal can resolve the event's visual presentation without a second `EventSettings` read of its own — purely a presentation concern, never consulted by the eligibility decision below. */
  eventVisualsEnabled: boolean;
}

/**
 * Which event's introduction modal (see docs/product-spec.md, event
 * system: "the modal is now the primary way users discover a newly-
 * started event, not Settings") should show right now, if any. Entirely
 * data-driven from `EVENT_DEFINITIONS` and per-occurrence participation
 * state (see `event-discovery.ts`) — no event id/name appears here, so a
 * future event is covered automatically.
 *
 * REWRITTEN (see docs/updates, "EVENT LIFECYCLE REPAIR" §3/§5/§7) — the
 * previous version gated this ENTIRELY on `EventSettings.eventsEnabled`
 * being `true` with no `activeEvent` set. `eventsEnabled` starts `false`
 * for every profile and is ONLY ever flipped to `true` as part of a real
 * opt-in — which simultaneously sets `activeEvent`, ALSO blocking the same
 * check — so that precondition was structurally unreachable through any
 * real UI action; the modal could never announce an event's FIRST natural
 * activation for any profile that had never joined anything before. It
 * also never cleared `activeEvent` when an event's window ended, so once
 * a profile ever joined ANYTHING, every later event's intro was silently
 * blocked forever. This function no longer reads either field at all —
 * eligibility is purely "naturally available now, and this profile has
 * never answered this occurrence" (`resolveEventIntroCandidate`), which is
 * reachable by construction for a profile's very first natural event.
 */
export async function resolveEventIntroToShow(
  repos: { settings: SettingsRepository; profiles: ProfileRepository },
  params: { profileId: string; timezone: string },
  deps: { clock?: Clock } = {},
): Promise<EventIntroCandidate | null> {
  const { statuses, eventVisualsEnabled } = await getEventDiscovery(
    repos,
    params,
    deps,
  );
  const candidate = resolveEventIntroCandidate(statuses);
  if (!candidate) {
    return null;
  }
  return {
    event: candidate.event,
    occurrenceKey: candidate.occurrenceKey,
    eventVisualsEnabled,
  };
}
