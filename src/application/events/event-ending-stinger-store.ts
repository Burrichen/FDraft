import type { SettingsRepository } from "@/repositories/settings-repository";

const EVENT_ENDING_STINGERS_KEY = "events.endingStingerAcknowledgements";

/**
 * Occurrence key -> whether this profile has dismissed that occurrence's
 * SECOND ending modal (see `EventEndingContent.stinger`, docs/updates
 * "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §16).
 *
 * A deliberate SIBLING settings key to `events.endingAcknowledgements`,
 * for precisely the reason that file's own doc comment gives for not
 * bolting fields onto `events.participations`: the first stage's stored
 * value is a validated bare boolean, so widening it into an object would
 * silently drop every existing profile's acknowledgement history on the
 * next read. Two independent boolean maps keep both stages' state exact,
 * and round-trip through backup/restore for free like every other key in
 * the generic settings table.
 */
export type EventEndingStingerAcknowledgements = Record<string, boolean>;

function resolveStingerAcknowledgements(
  value: unknown,
): EventEndingStingerAcknowledgements {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const result: EventEndingStingerAcknowledgements = {};
  for (const [occurrenceKey, acknowledged] of Object.entries(raw)) {
    if (typeof acknowledged === "boolean") {
      result[occurrenceKey] = acknowledged;
    }
  }
  return result;
}

export async function getEventEndingStingerAcknowledgements(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<EventEndingStingerAcknowledgements> {
  const stored = await repos.settings.get<EventEndingStingerAcknowledgements>(
    profileId,
    EVENT_ENDING_STINGERS_KEY,
  );
  return resolveStingerAcknowledgements(stored);
}

/** Whether this profile has already dismissed this occurrence's stinger — no recorded entry means unacknowledged, matching every other participation-style store. */
export async function isEventEndingStingerAcknowledged(
  repos: { settings: SettingsRepository },
  profileId: string,
  occurrenceKey: string,
): Promise<boolean> {
  const all = await getEventEndingStingerAcknowledgements(repos, profileId);
  return all[occurrenceKey] === true;
}

/** Records that the profile dismissed the stinger for exactly this occurrence. Never touches any other occurrence, and never touches the first stage's own acknowledgement. */
export async function acknowledgeEventEndingStinger(
  repos: { settings: SettingsRepository },
  params: { profileId: string; occurrenceKey: string },
): Promise<void> {
  const current = await getEventEndingStingerAcknowledgements(
    repos,
    params.profileId,
  );
  await repos.settings.set(params.profileId, EVENT_ENDING_STINGERS_KEY, {
    ...current,
    [params.occurrenceKey]: true,
  });
}

/**
 * Developer-only testing reset, mirroring
 * `clearEventEndingAcknowledgement` — clears exactly one occurrence's
 * stinger acknowledgement so the second stage can be re-triggered while
 * iterating under Admin EventClock overrides.
 */
export async function clearEventEndingStingerAcknowledgement(
  repos: { settings: SettingsRepository },
  params: { profileId: string; occurrenceKey: string },
): Promise<void> {
  const current = await getEventEndingStingerAcknowledgements(
    repos,
    params.profileId,
  );
  if (!(params.occurrenceKey in current)) {
    return;
  }
  const next = { ...current };
  delete next[params.occurrenceKey];
  await repos.settings.set(params.profileId, EVENT_ENDING_STINGERS_KEY, next);
}
