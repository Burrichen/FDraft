"use client";

import { useEffect, useRef } from "react";
import {
  hasNoUsableMetadata,
  mergeLocalFilmMetadata,
} from "@/application/watchlist/merge-local-film-metadata";
import { ActiveDraftFilms } from "@/components/drafts/active-draft-films";
import type { DraftFilmCardView } from "@/components/drafts/draft-film-card";
import { AsyncDataError } from "@/components/async-data-error";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useWatchUndo } from "@/components/watch-undo/watch-undo-provider";
import { useAsyncData } from "@/hooks/use-async-data";

/**
 * The film list inside the Say Goodbye screen (see docs/product-spec.md,
 * event system Phase 3) — deliberately the SAME `ActiveDraftFilms`/
 * `DraftFilmCard`/`WatchToggle` components the Active Draft page uses, so
 * marking a film watched here goes through the exact existing
 * `markLocalFilmWatched` path (including its own auto-archive check) —
 * nothing new to mark a film watched, no separate write path to keep in
 * sync with the real one. This component only loads the draft's films; it
 * has no opinion on confirm/cancel, which is `EventSwitcherSection`'s job.
 */
export function SayGoodbyeView({ draftId }: { draftId: string }) {
  const { activeProfile, repositories } = useProfileContext();
  const watchUndo = useWatchUndo();

  const { data, isLoading, error, reload, reloadSilently } =
    useAsyncData(async () => {
      if (!activeProfile) return null;
      const items = (await repositories.drafts.listItemsForDraft(draftId)).sort(
        (a, b) => a.orderIndex - b.orderIndex,
      );
      const films = await Promise.all(
        items.map((item) => repositories.films.getById(item.filmId)),
      );
      const metadataByFilmId = await repositories.films.getMetadataForFilms(
        items.map((item) => item.filmId),
      );
      const filmCards: DraftFilmCardView[] = items.map((item, index) => {
        const film = films[index];
        const metadata = mergeLocalFilmMetadata(
          metadataByFilmId.get(item.filmId) ?? [],
        );
        return {
          itemId: item.id,
          entryId: item.watchlistEntryId,
          title: film?.title ?? "Untitled",
          releaseYear: film?.releaseYear ?? null,
          runtimeMinutes: metadata.runtimeMinutes,
          letterboxdUri: film?.letterboxdUri ?? null,
          posterUrl: metadata.posterUrl,
          averageRating: metadata.averageRating,
          genres: metadata.genres,
          isCompleted: item.isCompleted,
          challenge: null,
          hasNoMetadata: hasNoUsableMetadata(metadata),
          // This screen only shows the outgoing draft's films one last time
          // before it's discarded — no reroll/franchise-substitution UI is
          // offered here, so there's nothing to look up an origin film for.
          substitution: null,
          // Nor is manual-replace/reroll — a draft about to be discarded
          // has nothing left to edit.
          canEdit: false,
          source: item.source,
        };
      });
      return { filmCards };
    }, [activeProfile?.id, draftId, repositories]);

  // Same pattern as drafts/page.tsx: keep the film list fresh after every
  // mark-watched/undo on this screen, without a callback threaded through
  // every card.
  const isFirstWatchUndoEffect = useRef(true);
  useEffect(() => {
    if (isFirstWatchUndoEffect.current) {
      isFirstWatchUndoEffect.current = false;
      return;
    }
    void reloadSilently();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchUndo]);

  if (error) {
    return <AsyncDataError error={error} onRetry={reload} />;
  }
  if (isLoading || !data) {
    return null;
  }

  return <ActiveDraftFilms films={data.filmCards} />;
}
