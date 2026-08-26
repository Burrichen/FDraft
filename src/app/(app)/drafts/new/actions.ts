import { createLocalDraft } from "@/application/drafts/local-draft-service";
import {
  getEventDiscovery,
  isOccurrenceActiveNow,
} from "@/application/events/event-discovery";
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
  const diyFilmEntryIds = formData
    .getAll("diyFilmEntryIds")
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
    diyFilmEntryIds: diyFilmEntryIds.length > 0 ? diyFilmEntryIds : undefined,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Please check your draft configuration and try again.",
    };
  }

  // A new draft is tagged with whichever event is currently active for
  // this profile (see docs/product-spec.md, event system Phase 5) —
  // reusing this exact, unmodified draft-creation flow rather than a
  // separate "event draft" path; normal FDraft drafting/eligibility
  // applies unchanged either way.
  //
  // Derived from the shared `isOccurrenceActiveNow` rule (genuinely
  // joined AND currently available/manually-enabled), never from
  // `EventSettings.activeEvent` directly (see docs/updates, "EVENT SYSTEM
  // BUGFIX — JANUARY REMAINS ACTIVE DURING HALLOWEEN TESTING") — that
  // field is only ever set on join and never cleared when its own window
  // closes, so trusting it here could silently tag a plain draft created
  // during Halloween's window with January's stale id, awarding Misery
  // Points instead of Lifetime Points for a draft that has nothing to do
  // with January.
  const discovery = await getEventDiscovery(context.repositories, {
    profileId: context.profileId,
    timezone: context.timezone,
  });
  const currentEventStatus = discovery.eventsEnabled
    ? discovery.statuses.find(isOccurrenceActiveNow)
    : undefined;
  const sourceEventId = currentEventStatus?.event.id ?? null;
  // Captured once, now, so a later change to participation/availability
  // (e.g. opting into a different event, or this one's window closing)
  // can never retroactively alter which currency THIS draft's completion
  // awards (see docs/product-spec.md, event system Phase 10).
  const sourceEventManuallyEnabled =
    currentEventStatus?.manuallyEnabled ?? null;

  const outcome = await createLocalDraft(context.repositories, {
    profileId: context.profileId,
    timezone: context.timezone,
    config: parsed.data,
    sourceEventId,
    sourceEventManuallyEnabled,
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
