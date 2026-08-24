import type {
  EventParticipationState,
  buildEventOccurrenceKey,
} from "@/domain/events/event-participation";
import type { SettingsRepository } from "@/repositories/settings-repository";

const EVENT_PARTICIPATIONS_KEY = "events.participations";

/** Occurrence key (see `buildEventOccurrenceKey`) -> the profile's recorded response for it. An occurrence with no entry is `"unanswered"` — see `resolveEventParticipationState`. */
export type EventParticipations = Record<string, EventParticipationState>;

const VALID_STATES: readonly EventParticipationState[] = [
  "unanswered",
  "joined",
  "declined",
];

/**
 * Normalizes a possibly-missing, partial, or corrupted persisted value —
 * `null` (nothing ever recorded, e.g. every profile that predates this
 * feature, or a brand-new profile) resolves to an empty map, and a
 * malformed entry is dropped rather than discarding the whole map. Reuses
 * the same generic `SettingsRepository` key/value store every other
 * event-scoped setting already lives in (`events.settings`, formerly
 * `events.dismissals`) — profile-isolated and backup/restore-safe for
 * free, with no new schema needed (see `backup-schema.ts`'s generic
 * `settings: boundedArray(backupSettingsEntrySchema)` — any key/value pair
 * in this table round-trips automatically).
 */
function resolveEventParticipations(value: unknown): EventParticipations {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const result: EventParticipations = {};
  for (const [occurrenceKey, state] of Object.entries(raw)) {
    if (
      typeof state === "string" &&
      (VALID_STATES as readonly string[]).includes(state)
    ) {
      result[occurrenceKey] = state as EventParticipationState;
    }
  }
  return result;
}

export async function getEventParticipations(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<EventParticipations> {
  const stored = await repos.settings.get<EventParticipations>(
    profileId,
    EVENT_PARTICIPATIONS_KEY,
  );
  return resolveEventParticipations(stored);
}

/**
 * Records a profile's response for exactly one occurrence — never touches
 * any other occurrence's entry, so joining `halloween:2026` has no effect
 * on `f-you-its-january:2026`, and declining `halloween:2026` has no
 * effect on a later `halloween:2027`. The one place this write happens;
 * see `beginEventOptIn`/`declineEventOccurrence`/`leaveEventOccurrence`
 * (`event-opt-in.ts`) for the actual call sites — this module never
 * decides WHICH state to write, only persists whichever one it's given.
 */
export async function setEventParticipation(
  repos: { settings: SettingsRepository },
  profileId: string,
  occurrenceKey: ReturnType<typeof buildEventOccurrenceKey>,
  state: EventParticipationState,
): Promise<void> {
  const current = await getEventParticipations(repos, profileId);
  await repos.settings.set(profileId, EVENT_PARTICIPATIONS_KEY, {
    ...current,
    [occurrenceKey]: state,
  });
}
