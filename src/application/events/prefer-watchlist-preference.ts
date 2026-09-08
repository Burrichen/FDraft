import type { SettingsRepository } from "@/repositories/settings-repository";

/**
 * A small, profile-scoped preference for category-based Event random
 * selection (see docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME
 * DRAFTING" §12): when on (the default), a Random pick from an Event
 * category (Horror/Kitsch/Classic/Adjacent) prefers a film that's ALSO on
 * the profile's active watchlist, falling back to the full curated
 * category only when that intersection is empty. Meaningless for January
 * (its pool is already 100% watchlist-derived), so never read/shown there.
 * Exactly the same small-arbitrary-preference pattern
 * `watchlist-sort-preference.ts` already established — a plain
 * `SettingsRepository` key, not a field on the core profile record.
 */
const PREFER_WATCHLIST_KEY = "events.preferWatchlist";

export async function getPreferWatchlistPreference(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<boolean> {
  const stored = await repos.settings.get<boolean>(
    profileId,
    PREFER_WATCHLIST_KEY,
  );
  return typeof stored === "boolean" ? stored : true;
}

export async function setPreferWatchlistPreference(
  repos: { settings: SettingsRepository },
  profileId: string,
  preferWatchlist: boolean,
): Promise<void> {
  await repos.settings.set(profileId, PREFER_WATCHLIST_KEY, preferWatchlist);
}
