"use client";

import type { DiySelectableFilmView } from "./diy-film-card";
import { DiyCompactFilmRow } from "./diy-compact-film-row";
import { RECOMMENDATION_QUESTIONS } from "./recommendation-questions";

/**
 * The DIY Draft selection screen's recommendation sidebar (see
 * docs/updates, v1.1.0, "NEW DRAFTING MODE — DIY DRAFT"; v1.1.1, "Need
 * Ideas copy" / "Recommendation UX polish"). Purely a display + a way to
 * toggle selection through the SAME `onToggle` callback the main grid
 * uses — this component never calls any application/service function
 * itself and never selects anything on its own, only ever reflecting
 * `selectedEntryIds` back and forwarding a click to the parent's own
 * selection state. `now` is threaded down from the view (never read
 * internally here) purely for the "longest on watchlist" question's
 * relative-duration qualifier text.
 */
export function RecommendationSidebar({
  films,
  selectedEntryIds,
  onToggle,
  now,
}: {
  films: readonly DiySelectableFilmView[];
  selectedEntryIds: ReadonlySet<string>;
  onToggle: (entryId: string) => void;
  now: Date;
}) {
  return (
    <aside
      aria-labelledby="diy-recommendations-heading"
      className="border-border bg-card space-y-4 rounded-lg border p-4"
    >
      <div>
        <h2
          id="diy-recommendations-heading"
          className="text-foreground text-sm font-bold"
        >
          Need ideas?
        </h2>
        <p className="text-muted-foreground text-xs">
          Below are some questions that might give you some ideas — and some
          relevant movies!
        </p>
      </div>
      <ul className="space-y-3">
        {RECOMMENDATION_QUESTIONS.map((question) => {
          const recommended = question.recommend(films, now);
          return (
            <li key={question.id}>
              <details className="group">
                <summary className="text-foreground hover:text-primary focus-visible:outline-ring cursor-pointer text-sm font-medium select-none focus-visible:outline-2 focus-visible:outline-offset-2">
                  {question.label}
                </summary>
                {recommended.length === 0 ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    No eligible films on your watchlist match this yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {recommended.map((film) => (
                      <li key={film.entryId}>
                        <DiyCompactFilmRow
                          film={film}
                          selected={selectedEntryIds.has(film.entryId)}
                          onToggle={onToggle}
                          subtitle={question.qualifier?.(film, now)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
