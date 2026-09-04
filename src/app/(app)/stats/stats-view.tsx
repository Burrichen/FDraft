"use client";

import { Clapperboard, Film } from "lucide-react";
import { mergeLocalFilmMetadata } from "@/application/watchlist/merge-local-film-metadata";
import { AsyncDataError } from "@/components/async-data-error";
import { EmptyState } from "@/components/empty-state";
import { AdditionsCard } from "@/components/stats/additions-card";
import { DistributionCard } from "@/components/stats/distribution-card";
import {
  HauntedPointsIcon,
  MiseryPointsIcon,
} from "@/components/stats/point-currency-icons";
import { PointsCard } from "@/components/stats/points-card";
import { StatCard } from "@/components/stats/stat-card";
import { useHalloweenAmbientVisible } from "@/components/events/halloween-ambient-decorations";
import { HalloweenPumpkin } from "@/components/events/halloween-pumpkin";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { formatRuntimeMinutes } from "@/domain/stats/format";
import {
  calculateWatchlistStats,
  type StatsFilmInput,
} from "@/domain/stats/watchlist-stats";
import { useAsyncData } from "@/hooks/use-async-data";

export function StatsView() {
  const { activeProfile, repositories } = useProfileContext();
  // Moved here from the History page (see docs/updates, "HALLOWEEN UI
  // CLEANUP" §2) — same persisted-per-profile state and click cycle
  // (`HalloweenPumpkin` itself is unchanged, only WHERE it's rendered
  // moved), shown under the exact same condition the app-wide ambient
  // decorations already use: Halloween currently joined/active AND Event
  // Visuals turned on. No visible "Halloween Pumpkin" caption (§3) — the
  // component's own `aria-label`/`title` already describe it for assistive
  // tech and hover, so it renders here as a pure visual decoration.
  const showHalloweenPumpkin = useHalloweenAmbientVisible();

  const {
    data: stats,
    isLoading,
    error,
    reload,
  } = useAsyncData(async () => {
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

  // Permanent point currency totals (see docs/updates, "PROMPT B2.2 —
  // HALLOWEEN PAGE REBUILD + DEADLINE + STATS" §6) — loaded independently
  // of the watchlist-derived stats above, since a profile can have real,
  // non-zero totals (or legitimately all-zero ones, e.g. Haunted Points
  // today — see docs/updates §"IF HAUNTED POINTS HAVE NO EARNING RULE")
  // regardless of whatever their CURRENT watchlist looks like.
  const { data: pointBalances } = useAsyncData(async () => {
    if (!activeProfile) return null;
    return repositories.points.getAllBalances(activeProfile.id);
  }, [activeProfile?.id, repositories]);

  if (!activeProfile) {
    return null;
  }
  if (error) {
    return <AsyncDataError error={error} onRetry={reload} />;
  }
  if (isLoading || !stats) {
    return null;
  }

  const isEmpty =
    (!stats.remainingCount.available || stats.remainingCount.value === 0) &&
    (!stats.watchedCount.available || stats.watchedCount.value === 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-heading">Stats</h1>
      </div>

      {pointBalances ? (
        <section className="space-y-3">
          <h2 className="text-foreground text-lg font-bold">Points</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PointsCard
              icon={Clapperboard}
              iconClassName="text-watchlist-green"
              label="Lifetime"
              value={pointBalances.lifetime}
            />
            <PointsCard
              icon={MiseryPointsIcon}
              iconClassName="text-blue-400"
              label="Misery"
              value={pointBalances.misery}
            />
            <PointsCard
              icon={HauntedPointsIcon}
              iconClassName="text-halloween-purple"
              label="Haunted"
              value={pointBalances.haunted}
            />
          </div>
        </section>
      ) : null}

      {isEmpty ? (
        <EmptyState
          icon={Film}
          title="No stats yet"
          description="Import your watchlist or add a few films to see stats here."
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              title="Remaining"
              stat={stats.remainingCount}
              render={(value) => (
                <p className="text-foreground text-2xl font-semibold">
                  {value}
                </p>
              )}
            />
            <StatCard
              title="Watched"
              stat={stats.watchedCount}
              render={(value) => (
                <p className="text-foreground text-2xl font-semibold">
                  {value}
                </p>
              )}
            />
            <StatCard
              title="Average age"
              stat={stats.averageAgeDays}
              render={(value) => (
                <p className="text-foreground text-2xl font-semibold">
                  {value}d
                </p>
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
            <AdditionsCard
              title="Oldest additions"
              stat={stats.oldestAdditions}
            />
            <AdditionsCard
              title="Newest additions"
              stat={stats.newestAdditions}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <DistributionCard title="Decades" stat={stats.decadeDistribution} />
            <DistributionCard title="Genres" stat={stats.genreDistribution} />
            <DistributionCard title="Ratings" stat={stats.ratingDistribution} />
            <DistributionCard
              title="Directors"
              stat={stats.directorDistribution}
            />
            <DistributionCard
              title="Countries"
              stat={stats.countryDistribution}
            />
            <DistributionCard
              title="Languages"
              stat={stats.languageDistribution}
            />
          </section>
        </>
      )}

      {showHalloweenPumpkin ? (
        // Bottom-centre, below every real stat card/chart/control — an
        // environmental decoration, not competing for space with any of
        // them (see docs/updates, "HALLOWEEN UI CLEANUP" §2).
        <div className="flex justify-center pt-2">
          <HalloweenPumpkin />
        </div>
      ) : null}
    </div>
  );
}
