import { calculateDraftFilmProgress } from "@/domain/drafts/progress";
import { getNextOccurrenceStart } from "@/domain/events/event-availability";
import { getEventDefinition } from "@/domain/events/event-registry";
import { GENERIC_POINT_CURRENCY } from "@/domain/events/point-currency";
import { getEventDiscovery } from "@/application/events/event-discovery";
import type { DraftFilmCardView } from "@/components/drafts/draft-film-card";
import type { FDraftThemeRenderContextValue } from "@/infrastructure/theme-runtime/render-context";
import type { Repositories } from "@/repositories";

/**
 * The one real, tested place FDraft's actual domain/repository state
 * becomes the typed `FDraftThemeRenderContextValue` every real component
 * adapter reads (see docs/updates, "FDRAFT THEME RUNTIME — PROMPT 10").
 * This is the "FDraft domain layer remains authoritative" boundary in
 * concrete code — a theme, and the adapters rendering it, never call
 * anything in this file or reach a repository directly; they only ever
 * see the plain values this function returns.
 *
 * `films` is host-SUPPLIED, not fetched here — matching
 * `ActiveDraftFilms`'s own existing convention (it already takes
 * pre-fetched `DraftFilmCardView[]` from whichever page owns the
 * fetch/mapping, never self-fetching). Extracting `DraftLifecycleView`'s
 * own private draft-record-to-card-view mapping into an independently
 * reusable function is real, careful work correctly left as a follow-up
 * (see docs/fdraft-theme-runtime/INTEGRATION.md's remaining blockers) —
 * reimplementing that mapping a second time here risked a subtly
 * incorrect duplicate of already-tested logic, which is exactly what
 * Prompt 10 says not to do.
 */
export async function buildFDraftThemeRenderContext(params: {
  repositories: Repositories;
  profileId: string;
  timezone: string;
  eventId: string;
  films: DraftFilmCardView[];
}): Promise<FDraftThemeRenderContextValue> {
  const { repositories, profileId, timezone, eventId, films } = params;
  const event = getEventDefinition(eventId);

  // One shared discovery read gives both `now` (Admin-Mode-aware, same
  // clock every other themed field below uses) and this event's real
  // recorded participation/availability — the exact same function every
  // other real consumer (nav, the intro modal, an event's own page) reads
  // from, never a second, independently-timed lookup that could disagree.
  const discovery = await getEventDiscovery(repositories, {
    profileId,
    timezone,
  });
  const now = discovery.now;
  const status = discovery.statuses.find((s) => s.event.id === eventId);

  const countdownTargetAtMs = event?.availability
    ? (getNextOccurrenceStart(event.availability, now, timezone)?.getTime() ??
      null)
    : null;

  const pointsBalance = event?.pointType
    ? await repositories.points.getBalance(profileId, event.pointType)
    : null;
  const lifetimePointsBalance = await repositories.points.getBalance(
    profileId,
    GENERIC_POINT_CURRENCY,
  );

  const progress = calculateDraftFilmProgress(
    films.filter((film) => film.isCompleted).length,
    films.length,
  );
  const draftGenerated = films.length > 0;
  const eventCompleted =
    progress.watchedCount > 0 && progress.watchedCount >= progress.totalCount;

  const eventAvailable = status?.available ?? false;
  const optedIn = status?.participation === "joined";
  const eventActive = eventAvailable || (status?.manuallyEnabled ?? false);
  const eventPhase: FDraftThemeRenderContextValue["eventPhase"] = !status
    ? undefined
    : eventActive
      ? optedIn
        ? "active"
        : "available"
      : optedIn
        ? "ended"
        : undefined;

  return {
    eventId,
    films,
    pointsBalance,
    lifetimePointsBalance,
    progressPercent: progress.percentWatched,
    watchedCount: progress.watchedCount,
    targetCount: progress.totalCount,
    countdownTargetAtMs,
    eventAvailable,
    eventActive,
    optedIn,
    draftGenerated,
    eventCompleted,
    eventPhase,
  };
}
