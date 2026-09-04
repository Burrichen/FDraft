"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  expireLocalDraftIfDue,
  replaceDraftSlot,
  rerollLocalDraftItemForMissingMetadata,
} from "@/application/drafts/local-draft-service";
import { getEffectiveEventDate } from "@/application/events/event-clock";
import { getEventSettings } from "@/application/events/event-settings-store";
import {
  hasNoUsableMetadata,
  mergeLocalFilmMetadata,
} from "@/application/watchlist/merge-local-film-metadata";
import { AsyncDataError } from "@/components/async-data-error";
import { ActiveDraftFilms } from "@/components/drafts/active-draft-films";
import type { DraftFilmCardView } from "@/components/drafts/draft-film-card";
import { DraftFilmCard } from "@/components/drafts/draft-film-card";
import { DraftNameEditor } from "@/components/drafts/draft-name-editor";
import { DraftTimeProgress } from "@/components/drafts/draft-time-progress";
import { ManualReplaceSlotSheet } from "@/components/drafts/manual-replace-slot-sheet";
import {
  PostmortemItem,
  type PostmortemItemView,
} from "@/components/drafts/postmortem-item";
import { EventPresentationBadge } from "@/components/events/event-presentation-badge";
import { RegenerateDraftButton } from "@/components/drafts/regenerate-draft-button";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useWatchUndo } from "@/components/watch-undo/watch-undo-provider";
import { challengeRegistry } from "@/domain/challenges/catalogue";
import { FREEFORM_BATCH_SIZE, isFreeform } from "@/domain/drafts/difficulty";
import { canEditDraftSlot } from "@/domain/drafts/draft-editing-permission";
import { getDraftDisplayName } from "@/domain/drafts/draft-name";
import { calculateDraftTimeProgress } from "@/domain/drafts/progress";
import { getCurrentOccurrenceBounds } from "@/domain/events/event-availability";
import {
  getEventDefinition,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";
import {
  resolveAdminMode,
  resolveFranchiseChronologicalOrder,
} from "@/domain/profiles/profile";
import { useAsyncData } from "@/hooks/use-async-data";
import { GenerateBatchButton } from "@/app/(app)/drafts/generate-batch-button";

/**
 * One Draft's full lifecycle UI (no draft / active / expired-with-
 * postmortem) — extracted from the Drafts page (see docs/updates, "PROMPT
 * B2.1 — DUAL DRAFT ARCHITECTURE") so an event's own dedicated page (e.g.
 * Halloween) can show and progress ITS OWN active draft exactly like the
 * normal Drafts page does, without linking away to `/drafts` — which,
 * since a normal Draft and an event Draft are now fully independent and
 * can both be active at once, would show the WRONG draft (or none at all)
 * as often as not.
 *
 * `sourceEventId` is the ONLY thing that distinguishes which draft this
 * instance is about — `null` for the profile's normal Draft, or a real
 * event id (e.g. `HALLOWEEN_EVENT_ID`) for that event's own — matched
 * exactly against `DraftRecord.sourceEventId` via the repository's own
 * scoped `getActiveOrExpiredDraft`/`hasActiveDraft`. Never inferred from a
 * route or page title.
 */
export interface DraftLifecycleViewProps {
  sourceEventId: string | null;
  /** Shown instead of the draft UI when this scope has no active/expired draft at all. */
  emptyState: ReactNode;
  /** Rendered above `emptyState` — the normal Drafts page's own "draft complete" banner; omitted (the default) shows nothing. */
  justArchivedBanner?: ReactNode;
  /** Rendered above the active-draft header — the normal Drafts page's post-creation challenge-shortfall banner; omitted (the default) shows nothing. */
  challengeWarning?: string | null;
  /** Fired the moment a postmortem response just archived the draft this view is showing — lets the caller show its own `justArchivedBanner` afterwards. */
  onDraftArchived?: () => void;
}

export function DraftLifecycleView({
  sourceEventId,
  emptyState,
  justArchivedBanner = null,
  challengeWarning = null,
  onDraftArchived,
}: DraftLifecycleViewProps) {
  const [replacingItemId, setReplacingItemId] = useState<string | null>(null);
  const { activeProfile, repositories } = useProfileContext();
  const watchUndo = useWatchUndo();

  const { data, isLoading, error, reload, reloadSilently } =
    useAsyncData(async () => {
      if (!activeProfile) return null;

      let draftRecord = await repositories.drafts.getActiveOrExpiredDraft(
        activeProfile.id,
        sourceEventId,
      );
      if (!draftRecord) {
        // This session's own last-remaining-film watch action may have just
        // archived this SAME-scope draft (see docs/product-spec.md,
        // "WATCHED FILM UNDO", "COMPLETED/FULLY WATCHED DRAFT") —
        // `getActiveOrExpiredDraft` correctly excludes archived drafts, but
        // the undo opportunity for that action must still be reachable
        // here, even after navigating away and back. Re-checked against
        // `sourceEventId` here too — `getPendingArchivedDraftId` has no
        // scope of its own, and a normal Draft's pending archive must never
        // surface on an event's own page, or vice versa.
        const pendingArchivedDraftId = watchUndo.getPendingArchivedDraftId();
        if (pendingArchivedDraftId) {
          const archived = await repositories.drafts.getById(
            activeProfile.id,
            pendingArchivedDraftId,
          );
          if (
            archived &&
            archived.status === "archived" &&
            (archived.sourceEventId ?? null) === sourceEventId
          ) {
            draftRecord = archived;
          }
        }
      }
      const eventSettings = await getEventSettings(
        repositories,
        activeProfile.id,
      );
      if (!draftRecord)
        return {
          draft: null,
          eventVisualsEnabled: eventSettings.eventVisualsEnabled,
        } as const;

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

      // Resolved separately from `films` above — most items have no
      // `originFilmId` at all, and the title-only lookup this needs is
      // cheap enough not to worry about batching alongside it.
      const originFilmIds = [
        ...new Set(
          items
            .map((item) => item.originFilmId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const originFilmsById = new Map(
        (
          await Promise.all(
            originFilmIds.map((id) => repositories.films.getById(id)),
          )
        )
          .filter((film) => film !== null)
          .map((film) => [film.id, film]),
      );

      const filmCards: DraftFilmCardView[] = items.map((item, index) => {
        const film = films[index];
        const metadata = mergeLocalFilmMetadata(
          metadataByFilmId.get(item.filmId) ?? [],
        );
        const challengeDefinition = item.challengeId
          ? challengeRegistry.getById(item.challengeId)
          : undefined;
        const originFilm = item.originFilmId
          ? (originFilmsById.get(item.originFilmId) ?? null)
          : null;
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
          hasNoMetadata: hasNoUsableMetadata(metadata),
          substitution:
            item.substitutionReason && originFilm
              ? {
                  reason: item.substitutionReason,
                  originalTitle: originFilm.title,
                }
              : null,
          // Baseline only — recomputed live against the current
          // Admin Mode setting just before rendering the active-draft
          // view (see `editableFilmCards` below), so toggling Admin Mode
          // elsewhere doesn't require a full reload to take effect here.
          canEdit: false,
          source: item.source,
        };
      });

      // For a "fixed event deadline" draft (see `EventDefinition.
      // fixedEventDeadline`, docs/updates "PROMPT B2.2 — HALLOWEEN PAGE
      // REBUILD + DEADLINE + STATS" §"EVENT TIME PROGRESS"), the time-
      // progress bar shows how far through the EVENT's own natural window
      // the profile is, not how far through this draft's own start-to-
      // deadline span — so `now` for that calculation is the Admin-aware
      // `getEffectiveEventDate`, not the real wall clock a plain draft
      // uses. `null` for a normal draft or any event without that flag.
      const event = draft.sourceEventId
        ? getEventDefinition(draft.sourceEventId)
        : null;
      const effectiveEventNow = event?.fixedEventDeadline
        ? await getEffectiveEventDate(repositories, activeProfile.id)
        : null;

      return {
        draft,
        items,
        filmCards,
        answeredItemIds,
        eventVisualsEnabled: eventSettings.eventVisualsEnabled,
        effectiveEventNow,
      } as const;
    }, [activeProfile?.id, repositories, sourceEventId]);

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
        {justArchivedBanner}
        {emptyState}
      </div>
    );
  }

  const {
    draft,
    items,
    filmCards,
    answeredItemIds,
    eventVisualsEnabled,
    effectiveEventNow,
  } = data;

  // For a "fixed event deadline" draft (Halloween), the displayed deadline
  // must always be the CURRENT Event occurrence's own end — never
  // `draft.deadlineAt` read verbatim (see docs/updates, "HALLOWEEN
  // COUNTDOWN BUG"): that stored value is only ever CORRECT because
  // `createHalloweenLocalDraft` happened to compute it the same way at
  // creation time, so a draft carrying a stale value from an earlier,
  // buggier Beta (or any future drift between the two calculations) would
  // silently show the wrong deadline forever. Deriving it fresh here,
  // exactly like `eventWindow` below already does for the progress bar's
  // own `startedAt`, is a read-only display fix — it never rewrites
  // `draft.deadlineAt` itself, which `expireLocalDraftIfDue`/
  // `finalizeExpiredEventDraftIfNeeded` still intentionally trust as-is
  // (see that file's own doc comment) for deciding when to actually expire
  // the draft, and a completed/expired draft's historical timestamps are
  // never touched.
  const event = draft.sourceEventId
    ? getEventDefinition(draft.sourceEventId)
    : null;
  // Halloween Draft naming is canonical ("Halloween <year> Draft" — see
  // docs/updates, "HALLOWEEN UI CLEANUP" §7-9) — the rename control is
  // hidden entirely for this event rather than offered and then silently
  // ignored, since `getDraftDisplayName` already refuses to show a custom
  // name for a Halloween draft regardless of what's persisted. No other
  // event (or a normal draft) is affected — January and normal drafts keep
  // their existing rename behaviour unchanged.
  const isHalloweenDraft = draft.sourceEventId === HALLOWEEN_EVENT_ID;
  const eventWindow =
    event?.fixedEventDeadline && effectiveEventNow
      ? getCurrentOccurrenceBounds(
          event.availability,
          effectiveEventNow,
          draft.timezone,
        )
      : null;
  const deadlineLabel = new Date(
    eventWindow ? eventWindow.end : draft.deadlineAt,
  ).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const freeform = isFreeform(draft.difficulty);
  const adminModeEnabled = resolveAdminMode(activeProfile.settings.adminMode);

  // Recomputed live against the current Admin Mode setting on every render
  // (see the `canEdit: false` baseline set where `filmCards` is built) —
  // toggling Admin Mode in Settings takes effect here immediately, without
  // needing a reload of this page's own async data.
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const editableFilmCards: DraftFilmCardView[] = filmCards.map((card) => {
    const item = itemsById.get(card.itemId);
    return {
      ...card,
      canEdit: item
        ? canEditDraftSlot({
            itemSource: item.source,
            draftSourceEventId: draft.sourceEventId,
            adminModeEnabled,
          })
        : false,
    };
  });
  const draftEntryIds = new Set(
    items
      .map((item) => item.watchlistEntryId)
      .filter((entryId): entryId is string => entryId !== null),
  );

  async function handleReroll(draftItemId: string) {
    if (!activeProfile) return;
    const outcome = await rerollLocalDraftItemForMissingMetadata(repositories, {
      profileId: activeProfile.id,
      draftId: draft.id,
      draftItemId,
    });
    if (!outcome.ok) {
      toast.error(outcome.message);
      return;
    }
    await reloadSilently();
  }

  function handleSlotReplaced(previousWatchlistEntryId: string | null) {
    // Mirrors `handleRegenerated`'s reasoning below — a pending session
    // "Undo" record for the just-replaced slot's PREVIOUS watchlist entry
    // now points at a draft item that no longer represents that watch, so
    // it's cleared here rather than left to surface a confusing/no-op Undo
    // button.
    if (previousWatchlistEntryId) {
      watchUndo.clearUndo(previousWatchlistEntryId);
    }
    void reloadSilently();
  }

  async function handleSlotReroll(draftItemId: string) {
    if (!activeProfile) return;
    const outcome = await replaceDraftSlot(repositories, {
      profileId: activeProfile.id,
      draftId: draft.id,
      draftItemId,
      adminModeEnabled,
      mode: { kind: "reroll" },
      franchiseChronologicalOrder: resolveFranchiseChronologicalOrder(
        activeProfile.settings.franchiseChronologicalOrder,
      ),
    });
    if (!outcome.ok) {
      toast.error(outcome.message);
      return;
    }
    handleSlotReplaced(outcome.previousWatchlistEntryId);
  }

  function handleManualReplace(draftItemId: string) {
    setReplacingItemId(draftItemId);
  }

  function handleRegenerated(
    revertedWatchlistEntryIds: string[],
    revertedDraftItemIds: string[],
  ) {
    // Each reverted item's watch has already been undone server-side by
    // `abandonLocalDraft` — any pending session "Undo" record for it now
    // points at a draft item that no longer exists, so it's cleared here
    // rather than left to surface a confusing/no-op Undo button (see
    // `components/watch-undo/watch-undo-provider.tsx`). Entry-based items
    // are keyed by `entryId`; a Halloween off-watchlist item has none and
    // is keyed by `draftItemId` instead — `clearUndoForItem` handles both.
    for (const entryId of revertedWatchlistEntryIds) {
      watchUndo.clearUndo(entryId);
    }
    for (const draftItemId of revertedDraftItemIds) {
      watchUndo.clearUndoForItem(null, draftItemId);
    }
    void reload();
  }

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
          <h1 className="page-heading flex flex-wrap items-center gap-1.5">
            {getDraftDisplayName(draft)} — expired
            <EventPresentationBadge
              sourceEventId={draft.sourceEventId}
              eventVisualsEnabled={eventVisualsEnabled}
            />
            {isHalloweenDraft ? null : (
              <DraftNameEditor
                draftId={draft.id}
                currentCustomName={draft.customName}
                onSaved={reloadSilently}
              />
            )}
          </h1>
          <p className="page-subtitle">
            {watchedFilms.length}/{items.length} films completed · deadline was{" "}
            {deadlineLabel}
          </p>
        </div>

        {postmortemFilms.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-foreground text-lg font-bold">
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
                    onDraftArchived?.();
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
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
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

  // `event`/`eventWindow` were already derived above (for `deadlineLabel`)
  // — a "fixed event deadline" draft's progress bar shows how far through
  // the EVENT's own natural window the profile is (see docs/updates,
  // "PROMPT B2.2", "EVENT TIME PROGRESS"), reusing that SAME window rather
  // than recomputing it, so the progress bar and the deadline text next to
  // it can never disagree with each other.
  const timeProgress = calculateDraftTimeProgress({
    mode: eventWindow ? "timer" : draft.timeMode,
    now: eventWindow && effectiveEventNow ? effectiveEventNow : new Date(),
    startedAt: eventWindow ? eventWindow.start : new Date(draft.startedAt),
    deadlineAt: eventWindow ? eventWindow.end : new Date(draft.deadlineAt),
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
          <h1 className="page-heading flex flex-wrap items-center gap-1.5">
            {getDraftDisplayName(draft)}
            <EventPresentationBadge
              sourceEventId={draft.sourceEventId}
              eventVisualsEnabled={eventVisualsEnabled}
            />
            {isHalloweenDraft ? null : (
              <DraftNameEditor
                draftId={draft.id}
                currentCustomName={draft.customName}
                onSaved={reloadSilently}
              />
            )}
          </h1>
          <p className="page-subtitle">
            {unresolvedChallengeCount > 0
              ? `${unresolvedChallengeCount} challenge slot${unresolvedChallengeCount === 1 ? "" : "s"} unfilled · `
              : ""}
            deadline {deadlineLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {freeform && draft.status === "active" ? (
            <GenerateBatchButton
              draftId={draft.id}
              batchSize={FREEFORM_BATCH_SIZE}
              onGenerated={reload}
            />
          ) : null}
          {adminModeEnabled && draft.status === "active" ? (
            <RegenerateDraftButton
              draftId={draft.id}
              onRegenerated={handleRegenerated}
            />
          ) : null}
        </div>
      </div>

      <DraftTimeProgress progress={timeProgress} />

      <ActiveDraftFilms
        films={editableFilmCards}
        onReroll={handleReroll}
        onManualReplace={handleManualReplace}
        onSlotReroll={handleSlotReroll}
        filmsProgressIndicatorClassName={
          isHalloweenDraft ? "bg-halloween-pumpkin" : undefined
        }
      />
      <ManualReplaceSlotSheet
        open={replacingItemId !== null}
        onOpenChange={(open) => {
          if (!open) setReplacingItemId(null);
        }}
        draftId={draft.id}
        draftItemId={replacingItemId ?? ""}
        excludedEntryIds={draftEntryIds}
        adminModeEnabled={adminModeEnabled}
        onReplaced={(previousWatchlistEntryId) => {
          setReplacingItemId(null);
          handleSlotReplaced(previousWatchlistEntryId);
        }}
      />
    </div>
  );
}
