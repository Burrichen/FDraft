import { Film } from "lucide-react";
import { FilmMetadataLine } from "@/components/film-metadata-line";
import type { OneAtATimeCandidateFilm } from "@/application/drafts/one-at-a-time-service";

/**
 * A candidate under review (Random pick / Challenge result) — see
 * docs/updates, "ONE AT A TIME DRAFTING — COMPLETE UX" §4/§7: "poster;
 * title; year; runtime; rating." Deliberately reuses the exact same
 * poster-box treatment and `FilmMetadataLine` every other film card in
 * this app (Watchlist, DIY, Active Draft) already renders through, rather
 * than a new presentation invented just for this screen — a candidate
 * should look like a real film card, not a generic confirmation dialog.
 * Not a button — this is a passive presentation; the actual Reroll/Okay
 * (or Use this film) actions live in the caller, since their exact set
 * differs per source.
 */
export function OneAtATimeCandidateCard({
  film,
}: {
  film: OneAtATimeCandidateFilm;
}) {
  return (
    <div className="border-border bg-card flex gap-4 rounded-lg border p-4 sm:gap-6 sm:p-6 lg:gap-8 lg:p-8">
      <div className="bg-muted aspect-2/3 w-28 shrink-0 overflow-hidden rounded-md sm:w-40 lg:w-52 xl:w-60">
        {film.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
          <img
            src={film.posterUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Film aria-hidden="true" className="size-8" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        <p className="text-foreground text-lg font-semibold sm:text-xl lg:text-2xl">
          {film.title}
        </p>
        <FilmMetadataLine
          releaseYear={film.releaseYear}
          runtimeMinutes={film.runtimeMinutes}
          averageRating={film.averageRating}
        />
      </div>
    </div>
  );
}
