import { Film } from "lucide-react";
import type { RecentlyWatchedFilmView } from "@/application/history/recently-watched";
import { EmptyState } from "@/components/empty-state";
import { DIFFICULTIES } from "@/domain/drafts/difficulty";
import { formatReadableCalendarDate } from "@/lib/utils";

/**
 * The History page's "Recently Watched" section (see docs/product-spec.md,
 * "HISTORY PAGE REDESIGN", "SECTION ONE — RECENTLY WATCHED"). A clearly
 * separate section from "Previous Drafts" below it, not folded into one
 * undifferentiated feed. Purely presentational — `films` is already
 * built, ordered, and capped at 5 by `listRecentlyWatchedFilms`.
 */
export function RecentlyWatchedSection({
  films,
}: {
  films: RecentlyWatchedFilmView[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-foreground text-lg font-bold">Recently Watched</h2>
      {films.length === 0 ? (
        <EmptyState
          icon={Film}
          title="Nothing watched yet"
          description="Films you mark watched will show up here, most recent first."
        />
      ) : (
        <ul className="space-y-2">
          {films.map((film) => (
            <li
              key={film.historyId}
              className="border-border bg-card flex gap-3 rounded-lg border p-3"
            >
              <div className="bg-muted aspect-2/3 w-12 shrink-0 overflow-hidden rounded">
                {film.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
                  <img
                    src={film.posterUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full w-full items-center justify-center">
                    <Film aria-hidden="true" className="size-5" />
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <div className="min-w-0">
                  <p className="text-foreground truncate font-medium">
                    {film.title}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {film.releaseYear ?? "Unknown year"}
                    {film.runtimeMinutes ? ` · ${film.runtimeMinutes} min` : ""}
                  </p>
                  {film.draftOrigin ? (
                    <p className="text-muted-foreground text-xs">
                      Via {DIFFICULTIES[film.draftOrigin.difficulty].label}{" "}
                      draft
                      {film.draftOrigin.challengeName
                        ? ` · Challenge: ${film.draftOrigin.challengeName}`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <p className="text-muted-foreground shrink-0 text-sm tabular-nums">
                  {film.watchedDate
                    ? formatReadableCalendarDate(film.watchedDate)
                    : "Unknown date"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
