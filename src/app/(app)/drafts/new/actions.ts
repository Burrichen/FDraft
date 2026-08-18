import { createLocalDraft } from "@/application/drafts/local-draft-service";
import { draftConfigInputSchema } from "@/domain/drafts/schemas";
import type { Repositories } from "@/repositories";

export interface CreateDraftActionState {
  error: string | null;
  draftId?: string;
  challengeWarning?: string | null;
}

function readOptionalString(
  formData: FormData,
  key: string,
): string | undefined {
  const raw = formData.get(key);
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Local, client-side equivalent of the old `"use server"` action (see
 * docs/product-spec.md, "FULL OFFLINE CORE FUNCTIONALITY" — Prompt 9.5B).
 * Still shaped as a `useActionState`-compatible `(prevState, formData)`
 * function — that hook works with any async function, server action or
 * not — just bound to the active profile/repositories by the form
 * component instead of reading a session server-side.
 */
export async function createDraftAction(
  context: {
    repositories: Repositories;
    profileId: string;
    timezone: string;
    /** "Franchises in chronological order" (see docs/updates) — the caller reads this off the active profile's own settings, the same convention `timezone` already follows. */
    franchiseChronologicalOrder: boolean;
  },
  _prevState: CreateDraftActionState,
  formData: FormData,
): Promise<CreateDraftActionState> {
  const randomCountRaw = formData.get("randomCount");
  const challengeCountRaw = formData.get("challengeCount");
  const randomCount =
    randomCountRaw !== null ? Number(randomCountRaw) : undefined;
  const challengeCount =
    challengeCountRaw !== null ? Number(challengeCountRaw) : undefined;
  const chosenChallengeIds = formData
    .getAll("chosenChallengeIds")
    .map(String)
    .filter((id) => id.length > 0);

  const parsed = draftConfigInputSchema.safeParse({
    difficulty: formData.get("difficulty"),
    timeMode: formData.get("timeMode"),
    randomCount,
    challengeCount,
    challengeMode: readOptionalString(formData, "challengeMode"),
    chosenChallengeIds:
      chosenChallengeIds.length > 0 ? chosenChallengeIds : undefined,
    manualGenre: readOptionalString(formData, "manualGenre"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Please check your draft configuration and try again.",
    };
  }

  const outcome = await createLocalDraft(context.repositories, {
    profileId: context.profileId,
    timezone: context.timezone,
    config: parsed.data,
    franchiseChronologicalOrder: context.franchiseChronologicalOrder,
  });

  if (!outcome.ok) {
    return { error: outcome.message };
  }

  return {
    error: null,
    draftId: outcome.draftId,
    challengeWarning: outcome.challengeWarning,
  };
}
