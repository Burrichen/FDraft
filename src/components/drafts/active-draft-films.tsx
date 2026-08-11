"use client";

import { useState } from "react";
import { calculateDraftFilmProgress } from "@/domain/drafts/progress";
import { Progress } from "@/components/ui/progress";
import { DraftFilmCard, type DraftFilmCardView } from "./draft-film-card";

/**
 * The Active Draft page's film list and FILM progress bar (see
 * docs/product-spec.md, "ACTIVE DRAFT PAGE"). A client island so marking a
 * film watched updates the progress bar and moves its card into the
 * "Completed" section immediately (see "immediately update progress") —
 * the mutation itself is still a real server action; this is the "feels
 * instant" layer on top, same pattern as the watchlist grid.
 */
export function ActiveDraftFilms({ films }: { films: DraftFilmCardView[] }) {
  const [locallyWatchedIds, setLocallyWatchedIds] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const effectiveFilms = films.map((film) =>
    locallyWatchedIds.has(film.itemId) ? { ...film, isCompleted: true } : film,
  );
  const toWatch = effectiveFilms.filter((film) => !film.isCompleted);
  const completed = effectiveFilms.filter((film) => film.isCompleted);
  const progress = calculateDraftFilmProgress(
    completed.length,
    effectiveFilms.length,
  );

  function handleWatched(itemId: string) {
    setLocallyWatchedIds((prev) => new Set(prev).add(itemId));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground font-medium">Films</span>
          <span className="text-muted-foreground tabular-nums">
            {progress.watchedCount}/{progress.totalCount} watched ·{" "}
            {progress.percentWatched}%
          </span>
        </div>
        <Progress value={progress.percentWatched} aria-label="Films watched" />
      </div>

      {toWatch.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {toWatch.map((film) => (
            <li key={film.itemId}>
              <DraftFilmCard film={film} onWatched={handleWatched} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          Every film here has been watched.
        </p>
      )}

      {completed.length > 0 ? (
        <details className="group">
          <summary className="text-muted-foreground hover:text-foreground focus-visible:outline-ring w-fit cursor-pointer text-sm font-medium select-none focus-visible:outline-2 focus-visible:outline-offset-2">
            Completed ({completed.length})
          </summary>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {completed.map((film) => (
              <li key={film.itemId}>
                <DraftFilmCard film={film} onWatched={handleWatched} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
