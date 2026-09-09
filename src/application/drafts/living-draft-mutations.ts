import {
  resolveDraftCompletionReward,
  resolveEffectiveRewardCurrency,
  reverseEventDraftItemReward,
} from "@/application/events/draft-completion-reward";
import { archiveLocalDraftIfResolved } from "@/application/drafts/local-draft-service";
import {
  dropNewestDraftMutation,
  resolveDraftUndoAvailability,
} from "@/domain/drafts/living-draft";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { PointsRepository } from "@/repositories/points-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";
import type { DraftItemRecord, DraftRecord } from "@/repositories/records";

type UndoRepos = {
  drafts: DraftRepository;
  watchlist: WatchlistRepository;
  history: HistoryRepository;
  points: PointsRepository;
  settings: SettingsRepository;
};

export type UndoDraftMutationErrorCode =
  "draft_not_found" | "draft_not_active" | "nothing_to_undo" | "item_missing";

export type UndoDraftMutationOutcome =
  | {
      ok: true;
      /** What was reversed, so a caller can word its confirmation without re-reading the history. */
      kind: "add" | "replace";
      draftItemId: string;
      /**
       * The watchlist entry of the film taken back out, or `null` for one
       * that never had an entry (a curated Event pool film).
       *
       * Returned so a caller can clear the session watch-undo record this
       * Undo just invalidated: those records are keyed by
       * `watchlistEntryId ?? draftItemId` (see
       * `watch-undo/watch-undo-provider.tsx`), and a record left pointing
       * at a watch that has ALREADY been reversed here would offer the
       * user a second reversal of the same watch. Pass this and
       * `draftItemId` straight to `clearUndoForItem`.
       */
      watchlistEntryId: string | null;
      /** Whether reversing this mutation also had to un-watch the film it removed (§6). */
      clearedWatchedState: boolean;
    }
  | { ok: false; error: UndoDraftMutationErrorCode; message: string };

/**
 * Reverses a Draft's most recent recorded membership change (see
 * docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §5/§6).
 *
 * Restores the Draft to the state immediately before that mutation:
 *  - an `"add"` is undone by removing the item again and decrementing the
 *    Draft's current size;
 *  - a `"replace"` is undone by putting the previous occupant back into
 *    the same slot, with its original `source`/`entrySource`/challenge
 *    context intact.
 *
 * In BOTH cases the film being removed is un-watched first if it had since
 * been marked watched (§6) — see `revertDraftItemWatchedState`. Undo
 * itself costs nothing and is never penalised; the only thing it reverses
 * beyond membership is the watch it is invalidating.
 *
 * Deliberately does NOT implement arbitrary film removal (§5): the only
 * thing it can remove is an addition it has a recorded mutation for, and
 * only the newest one.
 */
export async function undoLastDraftMutation(
  repos: UndoRepos,
  params: { profileId: string; draftId: string },
  deps: {
    clock?: Clock;
    /** Injectable only for tests — see the completion re-evaluation at the end of this function. */
    archiveIfResolved?: typeof archiveLocalDraftIfResolved;
  } = {},
): Promise<UndoDraftMutationOutcome> {
  const clock = deps.clock ?? new SystemClock();
  const archiveIfResolved =
    deps.archiveIfResolved ?? archiveLocalDraftIfResolved;

  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft) {
    return { ok: false, error: "draft_not_found", message: "Draft not found." };
  }
  // The same helper the UI reads to enable its Undo control, so the two
  // can never disagree about what is undoable (see
  // `resolveDraftUndoAvailability`, which also documents why an archived
  // Draft still is).
  const availability = resolveDraftUndoAvailability(draft);
  if (!availability.canUndo) {
    return availability.refusal === "nothing_to_undo"
      ? {
          ok: false,
          error: "nothing_to_undo",
          message: "There's nothing to undo on this draft.",
        }
      : {
          ok: false,
          error: "draft_not_active",
          message: "This draft can no longer be changed.",
        };
  }
  const mutation = availability.mutation;

  const item = await repos.drafts.getItemById(mutation.draftItemId);
  if (!item || item.draftId !== draft.id) {
    // The item this mutation describes is gone (a regenerate, an older
    // build, a partially-restored backup). Drop the stale entry rather
    // than leaving it stuck at the head of the history forever, and say so
    // honestly instead of pretending something was undone.
    await repos.drafts.updateDraft({
      ...draft,
      mutationHistory: dropNewestDraftMutation(draft.mutationHistory),
      updatedAt: clock.now().toISOString(),
    });
    return {
      ok: false,
      error: "item_missing",
      message: "That change can no longer be undone.",
    };
  }

  const clearedWatchedState = await revertDraftItemWatchedState(
    repos,
    { profileId: params.profileId, draft, item },
    { clock },
  );

  const now = clock.now().toISOString();
  // Re-read: `revertDraftItemWatchedState` may have un-archived the draft
  // and cleared its rewards, so the pre-reversal snapshot is stale.
  const currentDraft =
    (await repos.drafts.getById(params.profileId, params.draftId)) ?? draft;

  if (mutation.kind === "add") {
    await repos.drafts.deleteItem(item.id);
    await repos.drafts.updateDraft({
      ...currentDraft,
      totalFilms: Math.max(0, currentDraft.totalFilms - 1),
      mutationHistory: dropNewestDraftMutation(currentDraft.mutationHistory),
      updatedAt: now,
    });
    // Completion is judged on the films CURRENTLY in the Draft (§4), so
    // removing an UNWATCHED film can itself complete it — 11 films with 10
    // watched becomes a finished 10-film Draft. Re-evaluated through the
    // same central path every other completion uses, so the reward is
    // granted exactly once and by the same rules. (A `"replace"` undo
    // needs no equivalent: it always leaves the slot unwatched, and the
    // un-archiving it may require is handled by
    // `revertDraftItemWatchedState` above.)
    await archiveIfResolved(
      repos,
      { profileId: params.profileId, draftId: params.draftId },
      { clock },
    );
    return {
      ok: true,
      kind: "add",
      draftItemId: item.id,
      watchlistEntryId: item.watchlistEntryId,
      clearedWatchedState,
    };
  }

  const previous = mutation.previousItem;
  if (!previous) {
    // A `"replace"` with no snapshot cannot be reversed. Treated exactly
    // like a missing item: drop it rather than blocking the history.
    await repos.drafts.updateDraft({
      ...currentDraft,
      mutationHistory: dropNewestDraftMutation(currentDraft.mutationHistory),
      updatedAt: now,
    });
    return {
      ok: false,
      error: "item_missing",
      message: "That change can no longer be undone.",
    };
  }

  const restored: DraftItemRecord = {
    ...item,
    filmId: previous.filmId,
    watchlistEntryId: previous.watchlistEntryId,
    source: previous.source,
    entrySource: previous.entrySource,
    enteredAt: previous.enteredAt,
    challengeId: previous.challengeId,
    challengeAttemptId: previous.challengeAttemptId,
    challengeDisplayValue: previous.challengeDisplayValue,
    originFilmId: previous.originFilmId,
    substitutionReason: previous.substitutionReason,
    eventCategoryKey: previous.eventCategoryKey,
    orderIndex: previous.orderIndex,
    // The restored film's own watched state is not resurrected from the
    // snapshot — the snapshot deliberately never held it (see
    // `DraftMutationItemSnapshot`). Undo returns the slot to "this film is
    // in the draft, unwatched", which is what it was immediately before
    // the replacement.
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    eventRewardGrantedAt: null,
  };
  await repos.drafts.updateItem(restored);
  await repos.drafts.updateDraft({
    ...currentDraft,
    mutationHistory: dropNewestDraftMutation(currentDraft.mutationHistory),
    updatedAt: now,
  });

  return {
    ok: true,
    kind: "replace",
    draftItemId: item.id,
    // The REPLACEMENT film's entry — the watch that was just reversed —
    // not the restored one, which this Undo puts back unwatched.
    watchlistEntryId: item.watchlistEntryId,
    clearedWatchedState,
  };
}

/**
 * Un-watches one draft item completely, so removing or replacing its film
 * can never leave points, progress or completion in a corrupted state
 * (§6: "Undoing that mutation must also remove that watched status").
 *
 * Returns `false` (and touches nothing) when the item was never watched,
 * which is the ordinary case.
 *
 * This is the same reversal `undoLocalFilmWatched` performs, driven from
 * PERSISTED state instead of a session `WatchSessionUndoRecord`:
 *  - reverse the item's own per-film Event currency
 *    (`reverseEventDraftItemReward`);
 *  - clear the item's watched fields;
 *  - if that watch had archived the Draft, un-archive it AND reverse the
 *    completion reward it granted, recomputed through the same
 *    `resolveDraftCompletionReward`/`resolveEffectiveRewardCurrency` pair
 *    that granted it (so a manually-enabled Event's Lifetime-Points grant
 *    is reversed from `lifetime`, never from its own currency);
 *  - delete the exact watched-history row this item pointed at;
 *  - reactivate the watchlist entry the watch deactivated.
 *
 * Deliberately a separate function rather than a refactor of
 * `undoLocalFilmWatched`: that one reverses ONE watch action, which can
 * span two drafts at once and therefore needs cross-draft currency
 * de-duplication and a session record to identify itself by. This one
 * reverses ONE item in ONE draft, identified by the item's own stored
 * `watchedHistoryId`, and has no second draft to coordinate with. Sharing
 * the primitives rather than the orchestration keeps each honest about
 * what it actually guarantees.
 */
async function revertDraftItemWatchedState(
  repos: UndoRepos,
  params: { profileId: string; draft: DraftRecord; item: DraftItemRecord },
  deps: { clock: Clock },
): Promise<boolean> {
  const { item, draft } = params;
  if (!item.isCompleted && !item.watchedHistoryId) {
    return false;
  }
  const now = deps.clock.now().toISOString();

  const eventRewardReversed = await reverseEventDraftItemReward(repos, {
    profileId: params.profileId,
    draft,
    item,
  });

  await repos.drafts.updateItem({
    ...item,
    isCompleted: false,
    completedAt: null,
    watchedHistoryId: null,
    ...(eventRewardReversed ? { eventRewardGrantedAt: null } : {}),
  });

  // Re-read the draft: the item write above may have been preceded by the
  // event-reward reversal's own write, and archival state is read below.
  const currentDraft =
    (await repos.drafts.getById(params.profileId, draft.id)) ?? draft;
  if (currentDraft.status === "archived") {
    if (currentDraft.rewardsGrantedAt) {
      const reward = await resolveDraftCompletionReward(repos, {
        profileId: params.profileId,
        draft: currentDraft,
      });
      const currency = resolveEffectiveRewardCurrency(reward);
      if (reward.amount !== 0) {
        const currentTotal = await repos.points.getBalance(
          params.profileId,
          currency,
        );
        await repos.points.setBalance({
          profileId: params.profileId,
          currency,
          total: Math.max(0, currentTotal - reward.amount),
          updatedAt: now,
        });
      }
    }
    await repos.drafts.updateDraft({
      ...currentDraft,
      status: "active",
      completedAt: null,
      freeformAchievedRank: null,
      rewardsGrantedAt: null,
      updatedAt: now,
    });
  }

  if (item.watchedHistoryId) {
    await repos.history.deleteWatchedHistory(item.watchedHistoryId);
  }

  // The watch deactivated this entry with `removedReason: "watched"`;
  // reactivate it, and only it — never an entry removed for any other
  // reason (a postmortem "not interested", a manual removal).
  if (item.watchlistEntryId) {
    const entry = await repos.watchlist.getEntryById(
      params.profileId,
      item.watchlistEntryId,
    );
    if (entry && !entry.isActive && entry.removedReason === "watched") {
      await repos.watchlist.updateEntry({
        ...entry,
        isActive: true,
        removedAt: null,
        removedReason: null,
        updatedAt: now,
      });
    }
  }

  return true;
}
