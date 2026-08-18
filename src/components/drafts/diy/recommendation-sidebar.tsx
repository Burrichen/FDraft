"use client";

import { Check, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiySelectableFilmView } from "./diy-film-card";
import { RECOMMENDATION_QUESTIONS } from "./recommendation-questions";

/**
 * The DIY Draft selection screen's recommendation sidebar (see
 * docs/updates, v1.1.0, "NEW DRAFTING MODE — DIY DRAFT"). Purely a
 * display + a way to toggle selection through the SAME `onToggle`
 * callback the main grid uses — this component never calls any
 * application/service function itself and never selects anything on its
 * own, only ever reflecting `selectedEntryIds` back and forwarding a
 * click to the parent's own selection state.
 */
export function RecommendationSidebar({
  films,
  selectedEntryIds,
  onToggle,
}: {
  films: readonly DiySelectableFilmView[];
  selectedEntryIds: ReadonlySet<string>;
  onToggle: (entryId: string) => void;
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
          These are just suggestions — picking one here selects it the same way
          clicking its card would, nothing is chosen for you.
        </p>
      </div>
      <ul className="space-y-3">
        {RECOMMENDATION_QUESTIONS.map((question) => {
          const recommended = question.recommend(films);
          return (
            <li key={question.id}>
              <details className="group">
                <summary className="text-foreground hover:text-primary focus-visible:outline-ring cursor-pointer text-sm font-medium select-none focus-visible:outline-2 focus-visible:outline-offset-2">
                  {question.label}
                </summary>
                {recommended.length === 0 ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Nothing to suggest yet.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {recommended.map((film) => {
                      const isSelected = selectedEntryIds.has(film.entryId);
                      return (
                        <li key={film.entryId}>
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => onToggle(film.entryId)}
                            className={cn(
                              "focus-visible:outline-ring flex w-full items-center gap-2 rounded-md border p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
                              isSelected
                                ? "border-primary bg-secondary"
                                : "hover:bg-muted border-transparent",
                            )}
                          >
                            <div className="bg-muted relative aspect-2/3 w-8 shrink-0 overflow-hidden rounded-sm">
                              {film.posterUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
                                <img
                                  src={film.posterUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="text-muted-foreground flex h-full w-full items-center justify-center">
                                  <Film aria-hidden="true" className="size-3" />
                                </div>
                              )}
                            </div>
                            <span className="text-foreground min-w-0 flex-1 truncate text-xs">
                              {film.title}
                              {film.releaseYear ? ` (${film.releaseYear})` : ""}
                            </span>
                            {isSelected ? (
                              <Check
                                aria-hidden="true"
                                className="text-primary size-3.5 shrink-0"
                              />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
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
