"use client";

import { listLocalChallengeAvailability } from "@/application/challenges/list-local-challenge-availability";
import { getDiyEligibleFilms } from "@/application/drafts/local-diy-candidates";
import { AsyncDataError } from "@/components/async-data-error";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useAsyncData } from "@/hooks/use-async-data";
import { NewDraftForm } from "./new-draft-form";

export function NewDraftView() {
  const { activeProfile, repositories } = useProfileContext();

  const { data, isLoading, error, reload } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const activeWatchlistCount = (
      await repositories.watchlist.listActiveEntries(activeProfile.id)
    ).length;
    const availability = await listLocalChallengeAvailability(
      repositories,
      activeProfile.id,
    );
    // Same canonical eligible pool the DIY Draft screen uses — reused here
    // for the "Pick Your Own" challenge slot picker (see docs/updates,
    // v1.1.1, "DIY Challenge Film").
    const diyEligibleFilms = await getDiyEligibleFilms(
      repositories,
      activeProfile.id,
    );
    return { activeWatchlistCount, diyEligibleFilms, ...availability };
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
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="page-heading">Start a draft</h1>
        <p className="page-subtitle">
          A Monthly Watchlist Draft picks films from your active watchlist
          within a deadline you choose.
        </p>
      </div>
      <NewDraftForm
        activeWatchlistCount={data.activeWatchlistCount}
        challenges={data.challenges}
        availableGenres={data.availableGenres}
        diyEligibleFilms={data.diyEligibleFilms}
      />
    </div>
  );
}
