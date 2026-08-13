import { GENERIC_POINT_CURRENCY } from "@/domain/events/point-currency";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { DraftRepository } from "@/repositories/draft-repository";
import type { PointsRepository } from "@/repositories/points-repository";
import type { PointCurrency } from "@/repositories/records";

/**
 * Which event, if any, a draft's completion is being rewarded under — see
 * the event system's CRITICAL RULE: a MANUALLY enabled event may only ever
 * award generic/Lifetime Points, never its own unique currency. Omit this
 * entirely for a normal, non-event draft.
 */
export interface RewardEventContext {
  eventId: string;
  /** Whether the profile opted into this event manually (see `EventSettings.manuallyEnabledEvents`) rather than it being naturally active via its own `availability` window. */
  manuallyEnabled: boolean;
}

export interface DraftCompletionReward {
  /** The currency a normally-active event would award — ignored (downgraded to `GENERIC_POINT_CURRENCY`) whenever `eventContext.manuallyEnabled` is true. */
  currency: PointCurrency;
  amount: number;
  eventContext?: RewardEventContext;
}

/**
 * The one path anything that completes a draft goes through to actually
 * award points (see docs/product-spec.md, event system Phase 4:
 * "Provide one clear reward path where event context can determine the
 * effective currency" / "Enforce the manual-event rule centrally rather
 * than separately inside future events"). No caller computes a currency
 * amount by itself and pokes a balance directly — this is the only place
 * that ever writes to `PointsRepository`, and the only place the
 * manual-event downgrade rule is checked.
 *
 * Idempotency reuses `DraftRecord.rewardsGrantedAt` exactly as Phase 1
 * added it — a draft whose rewards were already granted is a no-op,
 * returning `false`, whether this is called once too often by a retry or
 * called again after the draft already settled through a different path.
 */
export async function awardDraftCompletionReward(
  repos: { drafts: DraftRepository; points: PointsRepository },
  params: {
    profileId: string;
    draftId: string;
    reward: DraftCompletionReward;
  },
  deps: { clock?: Clock } = {},
): Promise<boolean> {
  const clock = deps.clock ?? new SystemClock();
  const draft = await repos.drafts.getById(params.profileId, params.draftId);
  if (!draft || draft.rewardsGrantedAt) {
    return false;
  }

  // CRITICAL RULE: a manually enabled event awards only generic/Lifetime
  // Points, never its own currency — enforced here, once, rather than
  // trusting every future event to remember it independently.
  const currency = params.reward.eventContext?.manuallyEnabled
    ? GENERIC_POINT_CURRENCY
    : params.reward.currency;

  const now = clock.now().toISOString();
  if (params.reward.amount !== 0) {
    const currentTotal = await repos.points.getBalance(
      params.profileId,
      currency,
    );
    await repos.points.setBalance({
      profileId: params.profileId,
      currency,
      total: currentTotal + params.reward.amount,
      updatedAt: now,
    });
  }

  await repos.drafts.updateDraft({
    ...draft,
    rewardsGrantedAt: now,
    updatedAt: now,
  });
  return true;
}
