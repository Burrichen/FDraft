"use client";

import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { AdditionsCard } from "@/components/stats/additions-card";
import { DistributionCard } from "@/components/stats/distribution-card";
import { StatCard } from "@/components/stats/stat-card";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { formatRuntimeMinutes } from "@/domain/stats/format";
import {
  calculateWatchlistStats,
  type StatsFilmInput,
} from "@/domain/stats/watchlist-stats";
import { useAsyncData } from "@/hooks/use-async-data";

export function StatsView() {
  const { activeProfile, repositories } = useProfileContext();

  const { data: stats, isLoading } = useAsyncData(async () => {
    if (!activeProfile) return null;

    const activeEntries = await repositories.watchlist.listActiveEntries(
      activeProfile.id,
    );
    const allEntries = await repositories.watchlist.listAllEntries(
      activeProfile.id,
    );
    const watchedFromWatchlistCount = allEntries.filter(
      (entry) => entry.removedReason === "watched",
    ).length;

    const films = await Promise.all(
      activeEntries.map((entry) => repositories.films.getById(entry.filmId)),
    );
    const metadataByFilmId = await repositories.films.getMetadataForFilms(
      activeEntries.map((entry) => entry.filmId),
    );

    const activeFilms: StatsFilmInput[] = activeEntries.map((entry, index) => {
      const film = films[index];
      const metadata = mergeLocalFilmMetadata(
        metadataByFilmId.get(entry.filmId) ?? [],
      );
      return {
        title: film?.title ?? "Untitled",
        dateAdded: entry.dateAdded,
        releaseYear: film?.releaseYear ?? null,
        runtimeMinutes: metadata.runtimeMinutes,
        genres: metadata.genres,
        countries: metadata.countries,
        languages: metadata.languages,
        directors: metadata.directors,
        averageRating: metadata.averageRating,
      };
    });

    return calculateWatchlistStats({
      activeFilms,
      watchedFromWatchlistCount,
      now: new Date(),
    });
  }, [activeProfile?.id, repositories]);

  if (!activeProfile || isLoading || !stats) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-heading">Stats</h1>
        <p className="page-subtitle">
          Only shown when there&apos;s real data behind it — see
          docs/product-spec.md.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          title="Remaining"
          stat={stats.remainingCount}
          render={(value) => (
            <p className="text-foreground text-2xl font-semibold">{value}</p>
          )}
        />
        <StatCard
          title="Watched"
          stat={stats.watchedCount}
          render={(value) => (
            <p className="text-foreground text-2xl font-semibold">{value}</p>
          )}
        />
        <StatCard
          title="Average age"
          stat={stats.averageAgeDays}
          render={(value) => (
            <p className="text-foreground text-2xl font-semibold">{value}d</p>
          )}
        />
        <StatCard
          title="Average runtime"
          stat={stats.averageRuntimeMinutes}
          render={(value) => (
            <p className="text-foreground text-2xl font-semibold">
              {formatRuntimeMinutes(Math.round(value))}
            </p>
          )}
        />
        <StatCard
          title="Remaining runtime"
          stat={stats.totalRemainingRuntimeMinutes}
          render={(value) => (
            <p className="text-foreground text-2xl font-semibold">
              {formatRuntimeMinutes(value)}
            </p>
          )}
        />
        <StatCard
          title="Average rating"
          stat={stats.averageExternalRating}
          render={(value) => (
            <p className="text-foreground text-2xl font-semibold">
              ★ {value.toFixed(1)}
            </p>
          )}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <AdditionsCard title="Oldest additions" stat={stats.oldestAdditions} />
        <AdditionsCard title="Newest additions" stat={stats.newestAdditions} />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DistributionCard title="Decades" stat={stats.decadeDistribution} />
        <DistributionCard title="Genres" stat={stats.genreDistribution} />
        <DistributionCard title="Ratings" stat={stats.ratingDistribution} />
        <DistributionCard title="Directors" stat={stats.directorDistribution} />
        <DistributionCard title="Countries" stat={stats.countryDistribution} />
        <DistributionCard title="Languages" stat={stats.languageDistribution} />
      </section>
    </div>
  );
}
