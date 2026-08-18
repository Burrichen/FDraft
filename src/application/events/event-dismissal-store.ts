import type { SettingsRepository } from "@/repositories/settings-repository";

const EVENT_DISMISSALS_KEY = "events.dismissals";

/**
 * Event id -> the availability cycle id (see `getAvailabilityCycleId`,
 * `event-availability.ts`) whose introduction modal the profile last
 * dismissed via "Nah" (see docs/product-spec.md, event system Phase 6). An
 * event with no entry here has never been dismissed, or was dismissed for
 * a cycle that has since passed — either way, its intro is eligible to
 * show again. Stored through the same generic `SettingsRepository`
 * key/value store `EventSettings` already uses, not a new schema table —
 * consistent with the project's existing persistence conventions.
 */
export type EventDismissals = Record<string, string>;

/**
 * Normalizes a possibly-missing, partial, or corrupted persisted value —
 * `null` (nothing ever dismissed, e.g. every profile that predates this
 * feature) resolves to an empty map, and a malformed entry is dropped
 * rather than discarding the whole map.
 */
function resolveEventDismissals(value: unknown): EventDismissals {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const result: EventDismissals = {};
  for (const [eventId, cycleId] of Object.entries(raw)) {
    if (typeof cycleId === "string") {
      result[eventId] = cycleId;
    }
  }
  return result;
}

export async function getEventDismissals(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<EventDismissals> {
  const stored = await repos.settings.get<EventDismissals>(
    profileId,
    EVENT_DISMISSALS_KEY,
  );
  return resolveEventDismissals(stored);
}

/** Records that the profile pressed "Nah" on this event's intro for this specific availability cycle — never a permanent, all-time suppression. */
export async function dismissEventForCycle(
  repos: { settings: SettingsRepository },
  profileId: string,
  eventId: string,
  cycleId: string,
): Promise<void> {
  const current = await getEventDismissals(repos, profileId);
  await repos.settings.set(profileId, EVENT_DISMISSALS_KEY, {
    ...current,
    [eventId]: cycleId,
  });
}
