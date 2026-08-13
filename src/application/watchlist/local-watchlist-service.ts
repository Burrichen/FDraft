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
      /** The watched-history record this specific action created — the key `undoLocalFilmWatched` uses to reverse exactly this action and nothing else (see docs/product-spec.md, "WATCHED FILM UNDO"). */
      watchedHistoryId: string;
      draftItemId: string | null;
      /** The draft `draftItemId` belongs to, or `null` if this film wasn't part of any active draft. Carried alongside `draftArchivedByThisAction` so a caller can undo the archive too, not just the item completion. */
      draftId: string | null;
      /** Whether THIS call is what just archived that draft (e.g. completing its last remaining film) — see `archiveLocalDraftIfResolved`'s return value. `undoLocalFilmWatched` only ever reverts a draft's status back to "active" when this is true, never a draft that was already archived for an unrelated reason. */
      draftArchivedByThisAction: boolean;
    }
  | { ok: false; error: MarkWatchedErrorCode; message: string };

/**
 * Everything `undoLocalFilmWatched` needs to reverse one specific
 * `markLocalFilmWatched` call — a plain projection of its `ok: true`
 * outcome. Deliberately session-only: the UI holds these in memory (see
 * `src/components/watch-undo/watch-undo-provider.tsx`), never in the local
 * database — the watched action itself is what's persisted; the fact that
 * it can still be undone is not (see docs/product-spec.md, "WATCHED FILM
 * UNDO", "SESSION-ONLY STATE").
 */
export interface WatchSessionUndoRecord {
  watchlistEntryId: string;
  filmId: string;
  watchedHistoryId: string;
  draftItemId: string | null;
  draftId: string | null;
  draftArchivedByThisAction: boolean;
}

export type UndoMarkWatchedErrorCode = "not_found";
export type UndoMarkWatchedOutcome =
  | { ok: true }
  | { ok: false; error: UndoMarkWatchedErrorCode; message: string };

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

  let draftId: string | null = null;
  let draftArchivedByThisAction = false;
  if (draftItemId) {
    const item = await repos.drafts.getItemById(draftItemId);
    draftId = item?.draftId ?? null;
    if (draftId && deps.archiveIfResolved) {
      draftArchivedByThisAction = await deps.archiveIfResolved(repos, {
        profileId: params.profileId,
        draftId,
      });
    }
  }

  return {
    ok: true,
    watchlistEntryId: entry.id,
    filmId: entry.filmId,
    watchedHistoryId,
    draftItemId,
    draftId,
    draftArchivedByThisAction,
  };
}

/**
 * Reverses exactly one prior `markLocalFilmWatched` call — the "UNDO
 * SEMANTICS" rule from docs/product-spec.md, "WATCHED FILM UNDO": reactivate
 * the watchlist entry, revert the draft item it completed (and, if that
 * completion is what archived the draft, revert the draft back to active),
 * and delete the *exact* watched-history record that action created.
 *
 * Every step is guarded by re-checking that the record it's about to touch
 * is still, provably, the one this action produced — `item.watchedHistoryId
 * === record.watchedHistoryId`, `draft.status === "archived"` alongside
 * `record.draftArchivedByThisAction` — so a stale or already-superseded
 * `WatchSessionUndoRecord` (e.g. the film was watched again, or the draft
 * was archived for an unrelated reason) can never revert someone else's
 * state. This never touches any watched-history record other than the one
 * named by `record.watchedHistoryId`.
 */
export async function undoLocalFilmWatched(
  repos: {
    watchlist: WatchlistRepository;
    drafts: DraftRepository;
    history: HistoryRepository;
  },
  params: { profileId: string; record: WatchSessionUndoRecord },
  deps: { clock?: Clock } = {},
): Promise<UndoMarkWatchedOutcome> {
  const clock = deps.clock ?? new SystemClock();
  const { record } = params;

  const entry = await repos.watchlist.getEntryById(
    params.profileId,
    record.watchlistEntryId,
  );
  if (!entry) {
    return {
      ok: false,
      error: "not_found",
      message: "Watchlist entry not found.",
    };
  }

  const now = clock.now().toISOString();

  if (!entry.isActive && entry.removedReason === "watched") {
    await repos.watchlist.updateEntry({
      ...entry,
      isActive: true,
      removedAt: null,
      removedReason: null,
      updatedAt: now,
    });
  }

  if (record.draftItemId) {
    const item = await repos.drafts.getItemById(record.draftItemId);
    if (item && item.watchedHistoryId === record.watchedHistoryId) {
      await repos.drafts.updateItem({
        ...item,
        isCompleted: false,
        completedAt: null,
        watchedHistoryId: null,
      });

      if (record.draftId && record.draftArchivedByThisAction) {
        const draft = await repos.drafts.getById(
          params.profileId,
          record.draftId,
        );
        if (draft && draft.status === "archived") {
          await repos.drafts.updateDraft({
            ...draft,
            status: "active",
            completedAt: null,
            freeformAchievedRank: null,
            // Undoing the completion that archived this draft must also
            // undo any reward that archival granted — otherwise a later
            // re-completion would find `rewardsGrantedAt` already set and
            // skip granting it again.
            rewardsGrantedAt: null,
            updatedAt: now,
          });
        }
      }
    }
  }

  await repos.history.deleteWatchedHistory(record.watchedHistoryId);

  return { ok: true };
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
