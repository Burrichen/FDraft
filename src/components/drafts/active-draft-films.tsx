"use client";

import { calculateDraftFilmProgress } from "@/domain/drafts/progress";
import { Progress } from "@/components/ui/progress";
import { useWatchUndo } from "@/components/watch-undo/watch-undo-provider";
import { DraftFilmCard, type DraftFilmCardView } from "./draft-film-card";

/**
 * The Active Draft page's film list and FILM progress bar (see
 * docs/product-spec.md, "ACTIVE DRAFT PAGE", "WATCHED FILM UNDO"). `films`
 * comes straight from the parent's `useAsyncData`, kept fresh by the
 * parent's own `useEffect` reacting to `useWatchUndo()` (see
 * `drafts/page.tsx`) after every mark-watched/undo — so `film.isCompleted`
 * here is always genuinely fresh from the database, not a value this
 * component has to reason about overriding itself.
 */
export function ActiveDraftFilms({
  films,
  onReroll,
}: {
  films: DraftFilmCardView[];
  onReroll?: (itemId: string) => Promise<void>;
}) {
  const watchUndo = useWatchUndo();

  function hasPendingUndo(film: DraftFilmCardView): boolean {
    return Boolean(film.entryId && watchUndo.getRecord(film.entryId));
  }

  // A film completed THIS session (still undoable) stays in the main grid,
  // faded with its Undo control, rather than disappearing into the
  // collapsed section below — see docs/product-spec.md, "WATCHED FILM
  // UNDO", "VISUAL BEHAVIOUR": "The card should remain visible temporarily
  // rather than instantly disappearing." Only a film completed in an
  // EARLIER session (no pending record — undo is long gone) moves into
  // "Completed", exactly as before.
  const toWatch = films.filter(
    (film) => !film.isCompleted || hasPendingUndo(film),
  );
  const completed = films.filter(
    (film) => film.isCompleted && !hasPendingUndo(film),
  );
  const progress = calculateDraftFilmProgress(
    films.filter((film) => film.isCompleted).length,
    films.length,
  );

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
        <Progress
          value={progress.percentWatched}
          aria-label="Films watched"
          indicatorClassName="bg-watchlist-green"
        />
      </div>

      {toWatch.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {toWatch.map((film) => (
            <li key={film.itemId}>
              <DraftFilmCard film={film} onReroll={onReroll} />
            </li>
          ))}
        </ul>
      ) : films.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          This draft doesn&apos;t have any films yet.
        </p>
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
                <DraftFilmCard film={film} onReroll={onReroll} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
