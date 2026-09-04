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
    // Widened from `max-w-2xl`, then from a `max-w-5xl` cap that itself
    // fell short of this app's own ≥75%-of-viewport desktop-width bar from
    // 1440px up (see docs/product-spec.md, "Desktop Layout Width," and the
    // "FINAL QA FOR LAYOUT + HALLOWEEN + ONE AT A TIME" release-hardening
    // pass that measured it). Now uses the full shared shell width, same
    // as most other primary pages — the difficulty picker (7 options) and
    // the Challenge Browser's card grid both genuinely benefit from it.
    // The few small binary/ternary toggles in `NewDraftForm` (source,
    // challenge mode, time mode) would look absurd stretched this wide
    // themselves, so THEY carry their own narrow `max-w-xl` wrapper
    // locally instead of capping this whole page for their sake.
    <div className="space-y-6">
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
