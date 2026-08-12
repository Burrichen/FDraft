"use client";

import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { AsyncDataError } from "@/components/async-data-error";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { createDefaultRng } from "@/domain/shared/rng";
import { pickRandomFilm } from "@/domain/watchlist/random-pick";
import { useAsyncData } from "@/hooks/use-async-data";
import {
  RandomFilmPicker,
  type RandomFilmCandidate,
} from "./random-film-picker";

export function RandomFilmView() {
  const { activeProfile, repositories } = useProfileContext();

  const { data, isLoading, error, reload } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const entries = await repositories.watchlist.listActiveEntries(
      activeProfile.id,
    );
    const films = await Promise.all(
      entries.map((entry) => repositories.films.getById(entry.filmId)),
    );
    const metadataByFilmId = await repositories.films.getMetadataForFilms(
      entries.map((entry) => entry.filmId),
    );

    const candidates: RandomFilmCandidate[] = entries.map((entry, index) => {
      const film = films[index];
      const metadata = mergeLocalFilmMetadata(
        metadataByFilmId.get(entry.filmId) ?? [],
      );
      return {
        entryId: entry.id,
        filmId: entry.filmId,
        title: film?.title ?? "Untitled",
        dateAdded: entry.dateAdded,
        releaseYear: film?.releaseYear ?? null,
        runtimeMinutes: metadata.runtimeMinutes,
        letterboxdUri: film?.letterboxdUri ?? null,
        posterUrl: metadata.posterUrl,
        averageRating: metadata.averageRating,
        genres: metadata.genres,
        hasMetadata:
          metadata.posterUrl !== null ||
          metadata.genres !== null ||
          metadata.averageRating !== null ||
          metadata.runtimeMinutes !== null,
        weight: entry.selectionWeight,
      };
    });

    const initialPickId = pickRandomFilm(
      candidates.map((film) => ({ id: film.entryId, weight: film.weight })),
      createDefaultRng(),
    );

    return { candidates, initialPickId };
  }, [activeProfile?.id, repositories]);

  if (!activeProfile) {
    return null;
  }
  if (error) {
    return <AsyncDataError error={error} onRetry={reload} />;
  }
  if (isLoading || !data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-heading">Random film</h1>
        <p className="page-subtitle">
          One pick from your active watchlist, weighted by how long you&apos;ve
          been putting films off.
        </p>
      </div>

      <RandomFilmPicker
        films={data.candidates}
        initialPickId={data.initialPickId}
      />
    </div>
  );
}
