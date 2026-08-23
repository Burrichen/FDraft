import {
  resolveEventDateOverride,
  type EventDateOverride,
} from "@/domain/events/event-date-override";
import type { SettingsRepository } from "@/repositories/settings-repository";

const EVENT_DATE_OVERRIDE_KEY = "events.dateOverride";

export async function getEventDateOverride(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<EventDateOverride> {
  const stored = await repos.settings.get<EventDateOverride>(
    profileId,
    EVENT_DATE_OVERRIDE_KEY,
  );
  return resolveEventDateOverride(stored);
}

export async function setEventDateOverride(
  repos: { settings: SettingsRepository },
  profileId: string,
  override: EventDateOverride,
): Promise<void> {
  await repos.settings.set(profileId, EVENT_DATE_OVERRIDE_KEY, override);
}
