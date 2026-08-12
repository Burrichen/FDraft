import {
  DEFAULT_WATCHLIST_SORT,
  isWatchlistSortOption,
  type WatchlistSortOption,
} from "@/domain/watchlist/sort-filter";
import type { SettingsRepository } from "@/repositories/settings-repository";

/**
 * The Watchlist page's remembered sort choice (see docs/product-spec.md,
 * "WATCHLIST SORT / FILTER CONTROL", "SORT PERSISTENCE") — a small,
 * profile-scoped preference, exactly what `SettingsRepository` exists for,
 * not a field on the core `LocalProfile` record. Deliberately just the
 * chosen MODE, never a resulting order: picking "Shuffle" persists the
 * string `"shuffle"`, not the one-time random sequence it happened to
 * produce — every time that mode is active (including right after this
 * reads it back), a fresh shuffle is generated.
 */
const WATCHLIST_SORT_KEY = "watchlist.sort";

export async function getWatchlistSortPreference(
  repos: { settings: SettingsRepository },
  profileId: string,
): Promise<WatchlistSortOption> {
  const stored = await repos.settings.get<string>(
    profileId,
    WATCHLIST_SORT_KEY,
  );
  return isWatchlistSortOption(stored) ? stored : DEFAULT_WATCHLIST_SORT;
}

export async function setWatchlistSortPreference(
  repos: { settings: SettingsRepository },
  profileId: string,
  sort: WatchlistSortOption,
): Promise<void> {
  await repos.settings.set(profileId, WATCHLIST_SORT_KEY, sort);
}
