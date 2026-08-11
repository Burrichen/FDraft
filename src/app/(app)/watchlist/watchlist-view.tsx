"use client";

import { Shuffle, Upload } from "lucide-react";
import Link from "next/link";
import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import type { WatchlistFilmCardView } from "@/components/watchlist/types";
import { isWatchlistStale } from "@/domain/watchlist/stale-import";
import { useAsyncData } from "@/hooks/use-async-data";
import { StaleImportWarning } from "./stale-import-warning";
import { WatchlistGrid } from "./watchlist-grid";

export function WatchlistView() {
  const { activeProfile, repositories } = useProfileContext();

  const { data, isLoading } = useAsyncData(async () => {
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
    const lastImport = await repositories.watchlist.getLatestCompletedImport(
      activeProfile.id,
    );

    const cards: WatchlistFilmCardView[] = entries.map((entry, index) => {
      const film = films[index];
      const metadata = mergeLocalFilmMetadata(
        metadataByFilmId.get(entry.filmId) ?? [],
      );
      return {
        entryId: entry.id,
        filmId: entry.filmId,
        title: film?.title ?? "Untitled",
        releaseYear: film?.releaseYear ?? null,
        letterboxdUri: film?.letterboxdUri ?? null,
        posterUrl: metadata.posterUrl,
        averageRating: metadata.averageRating,
        genres: metadata.genres,
      };
    });

    const stale = isWatchlistStale({
      lastImportCompletedAt: lastImport?.completedAt
        ? new Date(lastImport.completedAt)
        : null,
      now: new Date(),
      timezone: activeProfile.timezone,
    });

    return {
      films: cards,
      stale,
      lastImportCompletedAt: lastImport?.completedAt ?? null,
    };
  }, [activeProfile?.id, repositories]);

  if (!activeProfile || isLoading || !data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-heading">Watchlist</h1>
          <p className="page-subtitle">
            {data.films.length} {data.films.length === 1 ? "film" : "films"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/watchlist/random" />}
          >
            <Shuffle aria-hidden="true" />
            Random film
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/watchlist/import" />}
          >
            <Upload aria-hidden="true" />
            Import
          </Button>
        </div>
      </div>

      {data.lastImportCompletedAt ? (
        <StaleImportWarning
          stale={data.stale}
          lastImportCompletedAt={data.lastImportCompletedAt}
        />
      ) : null}

      <WatchlistGrid films={data.films} />
    </div>
  );
}
