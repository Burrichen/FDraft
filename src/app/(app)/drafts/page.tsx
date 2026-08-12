"use client";

import { CheckCircle2, Clapperboard } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { expireLocalDraftIfDue } from "@/application/drafts/local-draft-service";
import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { AsyncDataError } from "@/components/async-data-error";
import { EmptyState } from "@/components/empty-state";
import { ActiveDraftFilms } from "@/components/drafts/active-draft-films";
import type { DraftFilmCardView } from "@/components/drafts/draft-film-card";
import { DraftFilmCard } from "@/components/drafts/draft-film-card";
import { DraftTimeProgress } from "@/components/drafts/draft-time-progress";
import {
  PostmortemItem,
  type PostmortemItemView,
} from "@/components/drafts/postmortem-item";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { useWatchUndo } from "@/components/watch-undo/watch-undo-provider";
import { challengeRegistry } from "@/domain/challenges/catalogue";
import {
  DIFFICULTIES,
  FREEFORM_BATCH_SIZE,
  isFreeform,
} from "@/domain/drafts/difficulty";
import { calculateDraftTimeProgress } from "@/domain/drafts/progress";
import { useAsyncData } from "@/hooks/use-async-data";
import { GenerateBatchButton } from "./generate-batch-button";

/**
 * Local-first rewrite of the Active Draft page (see docs/product-spec.md,
 * "FULL OFFLINE CORE FUNCTIONALITY", Prompt 9.5B). Same three states Phase
 * 9 established — no draft / active / expired-with-postmortem — now loaded
 * from the local repositories via `useAsyncData` instead of a Server
 * Component query, since IndexedDB only exists in the browser.
 *
 * The old "pending interactive challenges" section is gone: local "Choose
 * My Challenge" doesn't offer Battle Royale/Three Doors yet (see
 * `list-local-challenge-availability.ts`), so a local draft can never
 * actually have one pending — see docs/product-spec.md implementation log,
 * Phase 9.5B, "What this phase does NOT do".
 */
export default function DraftsPage() {
  const searchParams = useSearchParams();
  const challengeWarning = searchParams.get("challengeWarning");
  const [justArchived, setJustArchived] = useState(false);
  const { activeProfile, repositories } = useProfileContext();
  const watchUndo = useWatchUndo();

  const { data, isLoading, error, reload, reloadSilently } =
    useAsyncData(async () => {
      if (!activeProfile) return null;

      let draftRecord = await repositories.drafts.getActiveOrExpiredDraft(
        activeProfile.id,
      );
      if (!draftRecord) {
        // This session's own last-remaining-film watch action may have just
        // archived the profile's one draft (see docs/product-spec.md,
        // "WATCHED FILM UNDO", "COMPLETED/FULLY WATCHED DRAFT") —
        // `getActiveOrExpiredDraft` correctly excludes archived drafts, but
        // the undo opportunity for that action must still be reachable here,
        // even after navigating away and back.
        const pendingArchivedDraftId = watchUndo.getPendingArchivedDraftId();
        if (pendingArchivedDraftId) {
          const archived = await repositories.drafts.getById(
            activeProfile.id,
            pendingArchivedDraftId,
          );
          if (archived && archived.status === "archived") {
            draftRecord = archived;
          }
        }
      }
      if (!draftRecord) return { draft: null } as const;

      let status = draftRecord.status;
      if (status === "active") {
        const justExpired = await expireLocalDraftIfDue(repositories, {
          profileId: activeProfile.id,
          draftId: draftRecord.id,
        });
        if (justExpired) status = "expired";
      }
      const draft = { ...draftRecord, status };

      const items = (
        await repositories.drafts.listItemsForDraft(draft.id)
      ).sort((a, b) => a.orderIndex - b.orderIndex);
      const films = await Promise.all(
        items.map((item) => repositories.films.getById(item.filmId)),
      );
      const metadataByFilmId = await repositories.films.getMetadataForFilms(
        items.map((item) => item.filmId),
      );
      const answeredItemIds = new Set(
        (
          await repositories.history.listPostmortemResponsesForDraft(draft.id)
        ).map((response) => response.draftItemId),
      );
<<<<<<< Updated upstream
      const challengeDefinition = item.challengeId
        ? challengeRegistry.getById(item.challengeId)
        : undefined;
      return {
        itemId: item.id,
        entryId: item.watchlistEntryId,
        title: film?.title ?? "Untitled",
        releaseYear: film?.releaseYear ?? null,
        letterboxdUri: film?.letterboxdUri ?? null,
        posterUrl: metadata.posterUrl,
        averageRating: metadata.averageRating,
        genres: metadata.genres,
        isCompleted: item.isCompleted,
        challenge: challengeDefinition
          ? {
              name: challengeDefinition.name,
              description: challengeDefinition.description,
              displayValue: item.challengeDisplayValue,
            }
          : null,
      };
    });
=======
>>>>>>> Stashed changes

      const filmCards: DraftFilmCardView[] = items.map((item, index) => {
        const film = films[index];
        const metadata = mergeLocalFilmMetadata(
          metadataByFilmId.get(item.filmId) ?? [],
        );
        const challengeDefinition = item.challengeId
          ? challengeRegistry.getById(item.challengeId)
          : undefined;
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
          challenge: challengeDefinition
            ? {
                name: challengeDefinition.name,
                description: challengeDefinition.description,
                displayValue: item.challengeDisplayValue,
              }
            : null,
        };
      });

      return { draft, items, filmCards, answeredItemIds } as const;
    }, [activeProfile?.id, repositories]);

  // Keeps `filmCards`/`items` genuinely fresh after every mark-watched or
  // undo action anywhere on this page (see docs/product-spec.md, "WATCHED
  // FILM UNDO") — reacting to `watchUndo` itself, rather than a callback
  // threaded down through every card, is what makes this safe: React only
  // gives this a NEW `watchUndo` value after it has committed the
  // register/clear state update, so by the time this effect runs the
  // context is never stale the way calling `reloadSilently()` inline
  // immediately after that update would be. Skips the very first run so
  // mount doesn't trigger a redundant second fetch on top of `useAsyncData`'s
  // own.
  const isFirstWatchUndoEffect = useRef(true);
  useEffect(() => {
    if (isFirstWatchUndoEffect.current) {
      isFirstWatchUndoEffect.current = false;
      return;
    }
    void reloadSilently();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchUndo]);

  if (!activeProfile) {
    return null;
  }
  if (error) {
    return <AsyncDataError error={error} onRetry={reload} />;
  }
  if (isLoading || !data) {
    return null;
  }

  if (!data.draft) {
    return (
      <div className="space-y-6">
        {justArchived ? (
          <div className="border-watchlist-green/40 bg-watchlist-green/10 text-foreground flex items-center gap-2 rounded-lg border px-4 py-3 text-sm">
            <CheckCircle2
              aria-hidden="true"
              className="text-watchlist-green size-4 shrink-0"
            />
            Draft complete — nice work! See it in your{" "}
            <Link
              href="/drafts/history"
              className="underline underline-offset-2"
            >
              draft history
            </Link>
            .
          </div>
        ) : null}
        <div>
          <h1 className="page-heading">Active draft</h1>
          <p className="text-muted-foreground text-sm">
            A temporary watchlist challenge for a defined period.
          </p>
        </div>
        <EmptyState
          icon={Clapperboard}
          title="No active draft"
          description="Pick a difficulty, choose how the list is built, and take on a Monthly Watchlist Draft."
          action={
            <Button nativeButton={false} render={<Link href="/drafts/new" />}>
              Start a draft
            </Button>
          }
        />
      </div>
    );
  }

  const { draft, items, filmCards, answeredItemIds } = data;
  const deadlineLabel = new Date(draft.deadlineAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const freeform = isFreeform(draft.difficulty);

  if (draft.status === "expired") {
    const watchedItemIds = new Set(
      items.filter((item) => item.isCompleted).map((item) => item.id),
    );
    const unresolvedFilms = filmCards.filter(
      (film) => !film.isCompleted && !answeredItemIds.has(film.itemId),
    );
    const watchedFilms = filmCards.filter((film) =>
      watchedItemIds.has(film.itemId),
    );

    const postmortemFilms: PostmortemItemView[] = unresolvedFilms.map(
      (film) => ({
        draftItemId: film.itemId,
        title: film.title,
        releaseYear: film.releaseYear,
        posterUrl: film.posterUrl,
        existingResponse: null,
      }),
    );

    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="page-heading">
            {DIFFICULTIES[draft.difficulty].label} draft — expired
          </h1>
          <p className="text-muted-foreground text-sm">
            {watchedFilms.length}/{items.length} films completed · deadline was{" "}
            {deadlineLabel}
          </p>
        </div>

        {postmortemFilms.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-foreground text-lg font-semibold">
              Why didn&apos;t you watch these?
            </h2>
            <ul className="space-y-3">
              {postmortemFilms.map((film) => (
                <PostmortemItem
                  key={film.draftItemId}
                  draftId={draft.id}
                  difficulty={draft.difficulty}
                  film={film}
                  onArchived={() => {
                    setJustArchived(true);
                    reload();
                  }}
                />
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-muted-foreground text-sm">
            Every film has been resolved — this draft will finish archiving
            shortly.
          </p>
        )}

        {watchedFilms.length > 0 ? (
          <details className="group">
            <summary className="text-muted-foreground hover:text-foreground focus-visible:outline-ring w-fit cursor-pointer text-sm font-medium select-none focus-visible:outline-2 focus-visible:outline-offset-2">
              Completed ({watchedFilms.length})
            </summary>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {watchedFilms.map((film) => (
                <li key={film.itemId}>
                  <DraftFilmCard film={film} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    );
  }

  const challengeItemCount = items.filter(
    (item) => item.source === "challenge",
  ).length;
  const unresolvedChallengeCount =
    draft.challengeFilmCount - challengeItemCount;
  const timeProgress = calculateDraftTimeProgress({
    mode: draft.timeMode,
    now: new Date(),
    startedAt: new Date(draft.startedAt),
    deadlineAt: new Date(draft.deadlineAt),
    timezone: draft.timezone,
  });

  return (
    <div className="space-y-6">
      {challengeWarning ? (
        <div className="border-watchlist-orange/40 bg-watchlist-orange/10 text-foreground rounded-lg border px-4 py-3 text-sm">
          {challengeWarning}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-heading">
            {DIFFICULTIES[draft.difficulty].label} draft
          </h1>
          <p className="text-muted-foreground text-sm">
            {unresolvedChallengeCount > 0
              ? `${unresolvedChallengeCount} challenge slot${unresolvedChallengeCount === 1 ? "" : "s"} unfilled · `
              : ""}
            deadline {deadlineLabel}
          </p>
        </div>
        {freeform && draft.status === "active" ? (
          <GenerateBatchButton
            draftId={draft.id}
            batchSize={FREEFORM_BATCH_SIZE}
            onGenerated={reload}
          />
        ) : null}
      </div>

      <DraftTimeProgress progress={timeProgress} />

      <ActiveDraftFilms films={filmCards} />
    </div>
  );
}
