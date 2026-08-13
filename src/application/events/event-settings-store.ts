import {
  resolveEventSettings,
  type EventSettings,
} from "@/domain/events/event-settings";
import type { SettingsRepository } from "@/repositories/settings-repository";

const EVENT_SETTINGS_KEY = "events.settings";

export async function getEventSettings(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<EventSettings> {
  const stored = await repos.settings.get<EventSettings>(
    profileId,
    EVENT_SETTINGS_KEY,
  );
  return resolveEventSettings(stored);
}

export async function setEventSettings(
  repos: { settings: SettingsRepository },
  profileId: string,
  settings: EventSettings,
): Promise<void> {
  await repos.settings.set(profileId, EVENT_SETTINGS_KEY, settings);
}
