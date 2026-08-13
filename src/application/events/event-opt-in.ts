import { settleAndDiscardLocalDraft } from "@/application/drafts/local-draft-service";
import {
  getEventSettings,
  setEventSettings,
} from "@/application/events/event-settings-store";
import type { Clock } from "@/domain/time/clock";
import { SystemClock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { HistoryRepository } from "@/repositories/history-repository";
import type { PointsRepository } from "@/repositories/points-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";
import type { WatchlistRepository } from "@/repositories/watchlist-repository";

type EventOptInRepos = {
  drafts: DraftRepository;
  watchlist: WatchlistRepository;
  history: HistoryRepository;
  settings: SettingsRepository;
  points: PointsRepository;
};

export type BeginEventOptInResult =
  { needsSayGoodbye: false } | { needsSayGoodbye: true; activeDraftId: string };

/**
 * The entry point for "opt into full event participation" (see
 * docs/product-spec.md, event system Phase 3, "SAY GOODBYE"): never
 * immediately overwrites an active draft. With no active draft, this
 * applies the opt-in immediately — the existing, unchanged path. With one,
 * it applies NOTHING yet and reports back which draft the Say Goodbye
 * screen needs to show; the opt-in itself only completes once the caller
 * runs `confirmSayGoodbye`.
 */
export async function beginEventOptIn(
  repos: EventOptInRepos,
  params: { profileId: string },
): Promise<BeginEventOptInResult> {
  const hasActiveDraft = await repos.drafts.hasActiveDraft(params.profileId);
  if (!hasActiveDraft) {
    await applyEventOptIn(repos, params);
    return { needsSayGoodbye: false };
  }

  const activeDraft = await repos.drafts.getActiveOrExpiredDraft(
    params.profileId,
  );
  // hasActiveDraft just confirmed a status:"active" draft exists for this
  // profile, so getActiveOrExpiredDraft (which also considers "expired")
  // is guaranteed to find at least that one.
  return { needsSayGoodbye: true, activeDraftId: activeDraft!.id };
}

/** The actual event-settings mutation "opting in" performs — shared by the no-active-draft path above and `confirmSayGoodbye` below, so there is exactly one place this write happens. */
export async function applyEventOptIn(
  repos: { settings: SettingsRepository },
  params: { profileId: string },
): Promise<void> {
  const current = await getEventSettings(repos, params.profileId);
  await setEventSettings(repos, params.profileId, {
    ...current,
    eventsEnabled: true,
  });
}

/**
 * Confirms the Say Goodbye screen: settles and discards the outgoing
 * draft (see `settleAndDiscardLocalDraft` — generic/Lifetime reward
 * processing only, no event currency, no downgrade if it already
 * auto-archived), then resumes the event opt-in that was paused to show
 * this screen. The outgoing draft's `sourceEventId` is never touched.
 */
export async function confirmSayGoodbye(
  repos: EventOptInRepos,
  params: { profileId: string; draftId: string },
  deps: { clock?: Clock } = {},
): Promise<void> {
  const clock = deps.clock ?? new SystemClock();
  await settleAndDiscardLocalDraft(
    repos,
    { profileId: params.profileId, draftId: params.draftId },
    { clock },
  );
  await applyEventOptIn(repos, { profileId: params.profileId });
}
