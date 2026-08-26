import type { SettingsRepository } from "@/repositories/settings-repository";

const EVENT_ENDING_ACKNOWLEDGEMENTS_KEY = "events.endingAcknowledgements";

/** Occurrence key (see `buildEventOccurrenceKey`) -> whether this profile has dismissed that occurrence's Event-ending experience. An occurrence with no entry is unacknowledged — see `isEventEndingAcknowledged`. Deliberately a SIBLING settings key to `events.participations`, not a new field bolted onto it — see docs/updates, "EVENT SYSTEM — EVENT-OVER EXPERIENCE": participation's own persisted value is a validated bare string, so silently widening it to an object would drop every existing profile's history on next read. Round-trips through backup/restore automatically, same as every other key in this generic settings table (see `backup-schema.ts`'s `settings: boundedArray(backupSettingsEntrySchema)`). */
export type EventEndingAcknowledgements = Record<string, boolean>;

function resolveEventEndingAcknowledgements(
  value: unknown,
): EventEndingAcknowledgements {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const result: EventEndingAcknowledgements = {};
  for (const [occurrenceKey, acknowledged] of Object.entries(raw)) {
    if (typeof acknowledged === "boolean") {
      result[occurrenceKey] = acknowledged;
    }
  }
  return result;
}

export async function getEventEndingAcknowledgements(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<EventEndingAcknowledgements> {
  const stored = await repos.settings.get<EventEndingAcknowledgements>(
    profileId,
    EVENT_ENDING_ACKNOWLEDGEMENTS_KEY,
  );
  return resolveEventEndingAcknowledgements(stored);
}

/** Whether this profile has already dismissed this occurrence's Event-ending experience — an occurrence with no recorded entry is unacknowledged, matching `resolveEventParticipationState`'s "missing means the default" convention. */
export async function isEventEndingAcknowledged(
  repos: { settings: SettingsRepository },
  profileId: string,
  occurrenceKey: string,
): Promise<boolean> {
  const all = await getEventEndingAcknowledgements(repos, profileId);
  return all[occurrenceKey] === true;
}

/**
 * Records that the profile pressed the ending's dismiss action for exactly
 * this occurrence — see `EventEndingDialog`'s `handleAcknowledge`. Never
 * touches any other occurrence's entry, so acknowledging `halloween:2026`
 * has no effect on a later `halloween:2027`, which begins unacknowledged
 * regardless (a brand-new key that simply doesn't exist in the map yet).
 */
export async function acknowledgeEventEnding(
  repos: { settings: SettingsRepository },
  params: { profileId: string; occurrenceKey: string },
): Promise<void> {
  const current = await getEventEndingAcknowledgements(repos, params.profileId);
  await repos.settings.set(
    params.profileId,
    EVENT_ENDING_ACKNOWLEDGEMENTS_KEY,
    {
      ...current,
      [params.occurrenceKey]: true,
    },
  );
}

/**
 * Developer-only testing reset (see docs/updates, "EVENT SYSTEM —
 * EVENT-OVER EXPERIENCE" §14) — clears exactly one occurrence's
 * acknowledgement so its Event-ending experience can be re-triggered
 * while iterating on Admin EventClock overrides, without needing to
 * fabricate a brand-new occurrence key. Never touches participation, the
 * Draft, or any other occurrence's acknowledgement. Only ever called from
 * Admin-Mode-gated UI (`EventTestingSection`) — never exposed to a normal
 * user.
 */
export async function clearEventEndingAcknowledgement(
  repos: { settings: SettingsRepository },
  params: { profileId: string; occurrenceKey: string },
): Promise<void> {
  const current = await getEventEndingAcknowledgements(repos, params.profileId);
  if (!(params.occurrenceKey in current)) {
    return;
  }
  const next = { ...current };
  delete next[params.occurrenceKey];
  await repos.settings.set(
    params.profileId,
    EVENT_ENDING_ACKNOWLEDGEMENTS_KEY,
    next,
  );
}
