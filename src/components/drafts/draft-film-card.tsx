"use client";

import { Check, Film, Pencil, RefreshCw, Shuffle } from "lucide-react";
import { useState } from "react";
import { formatChallengeDisplayValue } from "@/domain/challenges/format-display-value";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilmMetadataLine } from "@/components/film-metadata-line";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useIsWatchedThisSession,
  WatchToggle,
} from "@/components/watchlist/watch-toggle";
import { cn } from "@/lib/utils";

export interface DraftFilmChallengeView {
  name: string;
  description: string;
  displayValue: Record<string, unknown> | null;
}

/** See `DraftItemRecord.originFilmId`/`substitutionReason` — resolved to a display-ready title by whichever page builds `DraftFilmCardView`, never recomputed here. */
export interface DraftFilmSubstitutionView {
  reason:
    "franchise_order" | "missing_metadata" | "manual_replace" | "user_reroll";
  originalTitle: string;
}

const SUBSTITUTION_CAPTION_PREFIX: Record<
  DraftFilmSubstitutionView["reason"],
  string | null
> = {
  franchise_order: "Franchise order · Originally rolled:",
  // Never shown today — `hasNoMetadata` already vanishes once a reroll
  // succeeds, and the auto-repair reroll doesn't need its own caption.
  missing_metadata: null,
  manual_replace: "Replaced · Originally:",
  user_reroll: "Rerolled · Originally:",
};

export interface DraftFilmCardView {
  itemId: string;
  /** Null once the underlying watchlist entry no longer exists (very old history) — the eye control is hidden then. */
  entryId: string | null;
  title: string;
  releaseYear: number | null;
  runtimeMinutes: number | null;
  letterboxdUri: string | null;
  posterUrl: string | null;
  averageRating: number | null;
  genres: string[] | null;
  isCompleted: boolean;
  challenge: DraftFilmChallengeView | null;
  /** True when this film genuinely has no usable metadata at all (see `hasNoUsableMetadata`) — drives the "Re-roll" affordance in place of genre chips. */
  hasNoMetadata: boolean;
  /** Non-null only when this slot's film differs from what was originally selected for it. */
  substitution: DraftFilmSubstitutionView | null;
  /** See `canEditDraftSlot` — true only for a random slot the current user/draft combination is allowed to manually replace or reroll (see docs/updates, v1.1.3 "Editable random draft slots"). Computed once by the page, never re-derived here. */
  canEdit: boolean;
}

/**
 * A poster card for a draft's film slots (see docs/product-spec.md, "ACTIVE
 * DRAFT PAGE" — poster/title/year/rating/genres/challenge badge/watched eye
 * control). The eye control is a sibling of the card's `<a>`, not a
 * descendant — a `<button>` nested inside an `<a>` is invalid HTML (the
 * same lesson from the watchlist's FilmCard) — so clicking it never
 * triggers the anchor's Letterboxd navigation. The "Re-roll" button (see
 * docs/updates, "MISSING-METADATA RE-ROLL BUTTON") is real interactive
 * `<button>` too, so for the same reason it lives in a block AFTER the
 * `</a>`, not inside it — only the poster/title/metadata line are the
 * clickable Letterboxd link; everything below (the conditional watched
 * text/genre chips/re-roll button, the franchise-order note, and the
 * challenge badge) is a sibling block underneath.
 *
 * The challenge badge and its description use a plain `<span>`
 * `TooltipTrigger` (`render`), which is fine there since a `<span>` isn't
 * a competing interactive element. Base UI's Tooltip opens on focus as
 * well as hover, and a tap on a touchscreen focuses the element first, so
 * this satisfies "hover/focus/tap should reveal the description" without
 * a separate mobile-only affordance.
 *
 * `onReroll` is optional — omitted entirely for a completed/watched card,
 * since rerolling something already watched makes no sense — and owns
 * its own pending state so the button disables itself for exactly the
 * duration of that one reroll, without the parent needing to track
 * per-card state.
 *
 * `onManualReplace`/`onSlotReroll` are the v1.1.3 "Editable random draft
 * slots" controls — a small pen icon and a monochrome circular-arrows
 * icon, shown ONLY when `film.canEdit` is true (see `canEditDraftSlot`),
 * regardless of `isCompleted` — replacing an already-watched film's slot
 * is exactly the scenario this feature exists for. Deliberately separate
 * from `onReroll`/`hasNoMetadata`'s auto-repair affordance: different
 * trigger, different icon (`RefreshCw`, not `Shuffle`), so the two
 * features never read as the same control. Clicking either one on an
 * already-watched slot asks for confirmation first, since the replacement
 * won't count toward this draft; an unwatched slot acts immediately.
 */
export function DraftFilmCard({
  film,
  onReroll,
  onManualReplace,
  onSlotReroll,
}: {
  film: DraftFilmCardView;
  onReroll?: (itemId: string) => Promise<void>;
  /** Opens the manual-replacement picker for this slot — synchronous; the picker itself owns the async mutation. */
  onManualReplace?: (itemId: string) => void;
  onSlotReroll?: (itemId: string) => Promise<void>;
}) {
  const [isRerolling, setIsRerolling] = useState(false);
  const [isSlotRerolling, setIsSlotRerolling] = useState(false);
  const [pendingEditAction, setPendingEditAction] = useState<
    "manual" | "reroll" | null
  >(null);
  const displayEntries = formatChallengeDisplayValue(
    film.challenge?.displayValue,
  );
  // `isWatchedThisSession` decides whether a *completed* card gets the
  // interactive Undo control or the old plain checkmark badge. A film
  // completed in an earlier session (no pending record) still shows the
  // static badge, exactly as before — only this session's own actions are
  // undoable (see docs/product-spec.md, "WATCHED FILM UNDO").
  const isWatchedThisSession = useIsWatchedThisSession(film.entryId);
  const canUndo = film.isCompleted && isWatchedThisSession && film.entryId;
  const showReroll = !film.isCompleted && film.hasNoMetadata && onReroll;

  async function handleReroll() {
    if (!onReroll) return;
    setIsRerolling(true);
    try {
      await onReroll(film.itemId);
    } finally {
      setIsRerolling(false);
    }
  }

  async function runEditAction(action: "manual" | "reroll") {
    setPendingEditAction(null);
    if (action === "manual") {
      onManualReplace?.(film.itemId);
      return;
    }
    if (!onSlotReroll) return;
    setIsSlotRerolling(true);
    try {
      await onSlotReroll(film.itemId);
    } finally {
      setIsSlotRerolling(false);
    }
  }

  function handleEditIconClick(action: "manual" | "reroll") {
    if (film.isCompleted) {
      setPendingEditAction(action);
      return;
    }
    void runEditAction(action);
  }

  return (
    <div className="group relative h-full">
      {!film.isCompleted && film.entryId ? (
        <WatchToggle entryId={film.entryId} title={film.title} />
      ) : null}
      {canUndo ? (
        <WatchToggle entryId={film.entryId!} title={film.title} />
      ) : null}
      {film.isCompleted && !canUndo ? (
        <div className="bg-watchlist-green text-primary-foreground absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-full">
          <Check aria-hidden="true" className="size-4" />
        </div>
      ) : null}
      {film.canEdit ? (
        <div className="absolute top-2 left-2 z-10 flex gap-1">
          {onManualReplace ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => handleEditIconClick("manual")}
                    aria-label={`Replace ${film.title} with a different film`}
                    className="bg-background/80 text-foreground hover:bg-background focus-visible:outline-ring flex size-6 items-center justify-center rounded-full backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-offset-1"
                  />
                }
              >
                <Pencil aria-hidden="true" className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Replace this film</TooltipContent>
            </Tooltip>
          ) : null}
          {onSlotReroll ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    disabled={isSlotRerolling}
                    onClick={() => handleEditIconClick("reroll")}
                    aria-label={`Re-roll ${film.title} for a new random film`}
                    className="bg-background/80 text-foreground hover:bg-background focus-visible:outline-ring flex size-6 items-center justify-center rounded-full backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-50"
                  />
                }
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn("size-3.5", isSlotRerolling && "animate-spin")}
                />
              </TooltipTrigger>
              <TooltipContent>Re-roll for a new random film</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
      <div className="border-border bg-card hover:border-primary/50 flex h-full flex-col overflow-hidden rounded-lg border transition-colors">
        <a
          href={film.letterboxdUri ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${film.title}${film.releaseYear ? ` (${film.releaseYear})` : ""} on Letterboxd`}
          className="focus-visible:outline-ring flex flex-1 flex-col focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          <div className="bg-muted aspect-2/3 w-full shrink-0 overflow-hidden">
            {film.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
              <img
                src={film.posterUrl}
                alt=""
                className={cn(
                  "h-full w-full object-cover transition-transform group-hover:scale-105",
                  film.isCompleted && "opacity-60",
                  canUndo && "grayscale-[50%]",
                )}
              />
            ) : (
              <div className="text-muted-foreground flex h-full w-full items-center justify-center">
                <Film aria-hidden="true" className="size-8" />
              </div>
            )}
          </div>
          <div className="space-y-1 p-2.5 pb-0">
            <p className="text-foreground truncate text-sm font-semibold">
              {film.title}
            </p>
            <FilmMetadataLine
              releaseYear={film.releaseYear}
              runtimeMinutes={film.runtimeMinutes}
              averageRating={film.averageRating}
            />
          </div>
        </a>
        <div className="space-y-1 p-2.5 pt-1">
          {canUndo ? (
            <p className="text-watchlist-green flex items-center gap-1 text-xs font-medium">
              <Check aria-hidden="true" className="size-3.5" />
              Watched
            </p>
          ) : showReroll ? (
            <Button
              type="button"
              size="xs"
              disabled={isRerolling}
              onClick={() => void handleReroll()}
              aria-label={`${film.title} has no metadata yet — re-roll for a different film`}
              className="bg-watchlist-yellow text-watchlist-yellow-foreground hover:bg-watchlist-yellow/90 w-full"
            >
              <Shuffle aria-hidden="true" />
              {isRerolling ? "Re-rolling…" : "Re-roll"}
            </Button>
          ) : film.genres?.length ? (
            <div className="flex flex-wrap gap-1">
              {film.genres.slice(0, 2).map((genre) => (
                <Badge
                  key={genre}
                  variant="secondary"
                  className="text-[0.65rem]"
                >
                  {genre}
                </Badge>
              ))}
            </div>
          ) : null}
          {film.substitution &&
          SUBSTITUTION_CAPTION_PREFIX[film.substitution.reason] ? (
            <p className="text-muted-foreground truncate text-[0.65rem]">
              {SUBSTITUTION_CAPTION_PREFIX[film.substitution.reason]}{" "}
              {film.substitution.originalTitle}
            </p>
          ) : null}
          {film.challenge ? (
            <Tooltip>
              <TooltipTrigger
                render={<span tabIndex={0} />}
                className="bg-watchlist-blue/15 text-watchlist-blue focus-visible:outline-ring inline-block w-full truncate rounded px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-1"
              >
                Challenge: {film.challenge.name}
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-56">{film.challenge.description}</p>
                {displayEntries.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {displayEntries.map((entry) => (
                      <li key={entry.label}>
                        {entry.label}: {entry.value}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <AlertDialog
        open={pendingEditAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingEditAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace a watched film?</AlertDialogTitle>
            <AlertDialogDescription>
              {film.title} has already been marked watched — replacing it means
              it won&apos;t count toward this draft. This won&apos;t affect your
              watch history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingEditAction && void runEditAction(pendingEditAction)
              }
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
