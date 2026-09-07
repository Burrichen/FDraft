import { submitLocalPostmortemResponse } from "@/application/drafts/local-draft-service";
import type {
  DraftDifficulty,
  PostmortemResponseType,
  Repositories,
} from "@/repositories";

export interface SubmitPostmortemActionResult {
  ok: boolean;
  error?: string;
  draftArchived?: boolean;
}

/**
 * Answers "Why didn't you watch these?" for one unwatched draft item (see
 * docs/product-spec.md, "EXPIRY / POST-DRAFT FLOW"). Idempotent —
 * resubmitting the same draft item (double-click, refresh mid-request)
 * never re-applies the weight/watchlist side effect — see
 * `submitLocalPostmortemResponse`.
 */
export async function submitPostmortemResponseAction(
  repositories: Repositories,
  params: {
    profileId: string;
    draftId: string;
    draftItemId: string;
    difficulty: DraftDifficulty;
    response: PostmortemResponseType;
  },
): Promise<SubmitPostmortemActionResult> {
  const outcome = await submitLocalPostmortemResponse(repositories, params);
  if (!outcome.ok) {
    return { ok: false, error: outcome.message };
  }
  return { ok: true, draftArchived: outcome.result.draftArchived };
}
