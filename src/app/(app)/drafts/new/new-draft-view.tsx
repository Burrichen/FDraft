"use client";

import { useSearchParams } from "next/navigation";
import { listLocalChallengeAvailability } from "@/application/challenges/list-local-challenge-availability";
import { AsyncDataError } from "@/components/async-data-error";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { useAsyncData } from "@/hooks/use-async-data";
import type { Repositories } from "@/repositories";
import { NewDraftForm } from "./new-draft-form";

/**
 * Resolves the chosen starting film's title for the banner. Returns
 * `null` — leaving the form in its ordinary state — for an entry that
 * isn't this profile's, is no longer active, or has no film row: an
 * unusable id must never make the whole page fail, and `createLocalDraft`
 * validates the entry properly again at submit time regardless.
 */
async function resolveStartWithFilm(
  repositories: Repositories,
  profileId: string,
  entryId: string,
): Promise<{ entryId: string; title: string } | null> {
  const entry = await repositories.watchlist.getEntryById(profileId, entryId);
  if (!entry || !entry.isActive) {
    return null;
  }
  const film = await repositories.films.getById(entry.filmId);
  return film ? { entryId: entry.id, title: film.title } : null;
}

export function NewDraftView() {
  const { activeProfile, repositories } = useProfileContext();
  const searchParams = useSearchParams();
  // The Watchlist card's "Add to Draft" action, taken with no draft in
  // progress (see docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" Part 2
  // §4). Carried as an entry id and resolved to a title here, so the form
  // can name the film rather than trusting one passed through the URL.
  const startWithEntryId = searchParams.get("startWith");

  const { data, isLoading, error, reload } = useAsyncData(async () => {
    if (!activeProfile) return null;
    const activeWatchlistCount = (
      await repositories.watchlist.listActiveEntries(activeProfile.id)
    ).length;
    const availability = await listLocalChallengeAvailability(
      repositories,
      activeProfile.id,
    );
    const startWithFilm = startWithEntryId
      ? await resolveStartWithFilm(
          repositories,
          activeProfile.id,
          startWithEntryId,
        )
      : null;
    return { activeWatchlistCount, startWithFilm, ...availability };
  }, [activeProfile?.id, repositories, startWithEntryId]);

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
    // as most other primary pages — the difficulty picker (6 options) and
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
        startWithFilm={data.startWithFilm}
      />
    </div>
  );
}
