import { formatInTimeZone } from "date-fns-tz";
import type { IdGenerator } from "@/domain/shared/id";
import { defaultIdGenerator } from "@/domain/shared/id";
import type { Clock } from "@/domain/time/clock";
import { SystemClock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { WatchlistEntryRecord } from "@/repositories/records";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";
import type { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";

export type MarkWatchedErrorCode = "not_found" | "not_active";
export type MarkWatchedOutcome =
  | {
      ok: true;
      watchlistEntryId: string;
      filmId: string;
      draftItemId: string | null;
    }
  | { ok: false; error: MarkWatchedErrorCode; message: string };

/**
 * Local port of the `mark_watchlist_entry_watched` Postgres function (see
 * docs/product-spec.md Phase 9 implementation log, and
 * `supabase/migrations/20260810001000_mark_watched_function.sql` for the
 * original): logs watched history, deactivates the watchlist entry, and —
 * if the film is an incomplete item in the profile's currently *active*
 * draft — completes that item too, then checks whether that completion
 * just resolved the whole draft ("completed early", see
 * `archiveLocalDraftIfResolved`).
 *
 * There is no database transaction spanning these three writes the way
 * Postgres's plpgsql function had one — IndexedDB transactions cannot span
 * an `await` boundary the way this function's shape would need, and Dexie's
 * transaction scope is per-call, not held across this multi-repository
 * call — so this favours the same "re-check before completing" pattern the
 * Supabase RPC used internally (re-reading `isActive` right before writing)
 * rather than assuming no interleaving is possible. A genuinely concurrent
 * double-click race is out of scope for a single-tab local-first app the
 * same way it already was for the Postgres version's own follow-on writes.
 */
export async function markLocalFilmWatched(
  repos: {
    watchlist: WatchlistRepository;
    drafts: DraftRepository;
    history: HistoryRepository;
  },
  params: {
    profileId: string;
    watchlistEntryId: string;
    profileTimezone: string;
  },
  deps: {
    idGenerator?: IdGenerator;
    clock?: Clock;
    archiveIfResolved?: typeof archiveLocalDraftIfResolved;
  } = {},
): Promise<MarkWatchedOutcome> {
  const idGenerator = deps.idGenerator ?? defaultIdGenerator;
  const clock = deps.clock ?? new SystemClock();

  const entry = await repos.watchlist.getEntryById(
    params.profileId,
    params.watchlistEntryId,
  );
  if (!entry) {
    return {
      ok: false,
      error: "not_found",
      message: "Watchlist entry not found.",
    };
  }
  if (!entry.isActive) {
    return {
      ok: false,
      error: "not_active",
      message: "This watchlist entry is not active.",
    };
  }

  const now = clock.now();
  const watchedHistoryId = idGenerator.generate();
  await repos.history.addWatchedHistory({
    id: watchedHistoryId,
    profileId: params.profileId,
    filmId: entry.filmId,
    watchlistEntryId: entry.id,
    source: "app_watchlist_action",
    watchedDate: formatInTimeZone(now, params.profileTimezone, "yyyy-MM-dd"),
    createdAt: now.toISOString(),
  });

  const updatedEntry: WatchlistEntryRecord = {
    ...entry,
    isActive: false,
    removedAt: now.toISOString(),
    removedReason: "watched",
    updatedAt: now.toISOString(),
  };
  await repos.watchlist.updateEntry(updatedEntry);

  const draftItemId = await completeMatchingActiveDraftItem(repos, {
    profileId: params.profileId,
    watchlistEntryId: entry.id,
    watchedHistoryId,
    now,
  });

  if (draftItemId && deps.archiveIfResolved) {
    const item = await repos.drafts.getItemById(draftItemId);
    if (item) {
      await deps.archiveIfResolved(repos, {
        profileId: params.profileId,
        draftId: item.draftId,
      });
    }
  }

  return {
    ok: true,
    watchlistEntryId: entry.id,
    filmId: entry.filmId,
    draftItemId,
  };
}

async function completeMatchingActiveDraftItem(
  repos: { drafts: DraftRepository },
  params: {
    profileId: string;
    watchlistEntryId: string;
    watchedHistoryId: string;
    now: Date;
  },
): Promise<string | null> {
  const items = await repos.drafts.findItemsByWatchlistEntryId(
    params.watchlistEntryId,
  );
  const incompleteItem = items.find((item) => !item.isCompleted);
  if (!incompleteItem) {
    return null;
  }

  const draft = await repos.drafts.getById(
    params.profileId,
    incompleteItem.draftId,
  );
  if (!draft || draft.status !== "active") {
    return null;
  }

  await repos.drafts.updateItem({
    ...incompleteItem,
    isCompleted: true,
    completedAt: params.now.toISOString(),
    watchedHistoryId: params.watchedHistoryId,
  });
  return incompleteItem.id;
}

export async function listActiveWatchlist(
  repos: { watchlist: WatchlistRepository },
  profileId: string,
) {
  return repos.watchlist.listActiveEntries(profileId);
}
