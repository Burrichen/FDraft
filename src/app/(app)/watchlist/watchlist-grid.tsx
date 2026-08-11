"use client";

import { Film, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { FilmCard } from "@/components/watchlist/film-card";
import type { WatchlistFilmCardView } from "@/components/watchlist/types";

/**
 * Client island so marking a film watched can hide its card immediately
 * (optimistic) instead of waiting on the server-revalidated page data — the
 * mutation itself is still a real server action; this is purely the "feels
 * instant" layer on top.
 */
export function WatchlistGrid({ films }: { films: WatchlistFilmCardView[] }) {
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const visibleFilms = films.filter((film) => !hiddenIds.has(film.entryId));

  if (visibleFilms.length === 0) {
    const watchlistIsEmpty = films.length === 0;
    return (
      <EmptyState
        icon={Film}
        title={watchlistIsEmpty ? "Your watchlist is empty" : "All caught up!"}
        description={
          watchlistIsEmpty
            ? "Import your Letterboxd watchlist.csv, or a full export .zip, to get started."
            : "You've marked every film here as watched."
        }
        action={
          watchlistIsEmpty ? (
            <Button
              nativeButton={false}
              render={<Link href="/watchlist/import" />}
            >
              <Upload aria-hidden="true" />
              Import watchlist
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {visibleFilms.map((film) => (
        <li key={film.entryId}>
          <FilmCard
            film={film}
            onWatched={(entryId) =>
              setHiddenIds((prev) => new Set(prev).add(entryId))
            }
          />
        </li>
      ))}
    </ul>
  );
}
