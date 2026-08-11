"use client";

import { Film, Shuffle } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { FilmCard } from "@/components/watchlist/film-card";
import type { WatchlistFilmCardView } from "@/components/watchlist/types";
import { createDefaultRng } from "@/domain/shared/rng";
import { pickRandomFilm } from "@/domain/watchlist/random-pick";

export interface RandomFilmCandidate extends WatchlistFilmCardView {
  weight: number;
}

interface RandomFilmPickerProps {
  films: RandomFilmCandidate[];
  /**
   * Chosen server-side so the very first render matches between server and
   * client exactly — picking with Math.random() independently on each side
   * would be a classic hydration mismatch (see docs/product-spec.md,
   * "Randomness Engineering"). Only rerolls after that use client-side
   * randomness, which is fine: there's no SSR output to match anymore.
   */
  initialPickId: string | null;
}

function toWeighted(films: RandomFilmCandidate[]) {
  return films.map((film) => ({ id: film.entryId, weight: film.weight }));
}

export function RandomFilmPicker({
  films,
  initialPickId,
}: RandomFilmPickerProps) {
  const rng = useMemo(() => createDefaultRng(), []);
  const [pool, setPool] = useState(films);
  const [currentId, setCurrentId] = useState(initialPickId);

  const currentFilm = pool.find((film) => film.entryId === currentId) ?? null;

  function reroll() {
    setCurrentId(pickRandomFilm(toWeighted(pool), rng, currentId));
  }

  function handleWatched(entryId: string) {
    const remaining = pool.filter((film) => film.entryId !== entryId);
    setPool(remaining);
    setCurrentId(pickRandomFilm(toWeighted(remaining), rng));
  }

  if (!currentFilm) {
    const watchlistIsEmpty = films.length === 0;
    return (
      <EmptyState
        icon={Film}
        title={
          watchlistIsEmpty ? "Your watchlist is empty" : "Nothing left to pick!"
        }
        description={
          watchlistIsEmpty
            ? "Import your Letterboxd watchlist to get a random pick."
            : "You've marked everything in this session's pool as watched."
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xs space-y-4">
      <FilmCard film={currentFilm} onWatched={handleWatched} size="large" />
      <Button onClick={reroll} variant="outline" className="w-full">
        <Shuffle aria-hidden="true" />
        Reroll
      </Button>
    </div>
  );
}
