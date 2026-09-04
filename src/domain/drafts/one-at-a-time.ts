import type { DraftItemSource } from "@/repositories/records";

/**
 * The One At A Time Draft Builder (see docs/updates, "ONE AT A TIME
 * DRAFTING — CORE SYSTEM") — a temporary, session-only staging area a
 * profile fills one film at a time before committing it as a real Draft.
 * Nothing here is persisted; it only exists in memory for the lifetime of
 * the builder screen (see `use-one-at-a-time-builder.ts`), the same
 * "leaving loses the in-progress state, on purpose" convention every other
 * unsubmitted draft-creation form in this app already follows — there is
 * no session-recovery mechanism to reuse, so this deliberately doesn't
 * invent one.
 *
 * A staged item can only ever have come from one of the three sources this
 * mode offers — a narrower subset of the full `DraftItemSource` union
 * (which also includes the Halloween-only pool sources), not a new type of
 * its own, so the eventual `DraftItemRecord` this becomes needs no
 * translation step.
 */
export type OneAtATimeItemSource = Extract<
  DraftItemSource,
  "random" | "manual" | "challenge"
>;

/**
 * One confirmed film in the builder. Deliberately carries its own
 * `title`/`releaseYear` (rather than requiring a re-fetch to render "Your
 * Draft So Far") — cheap to keep alongside the ids since every source path
 * already has this data in hand at the moment of confirmation.
 */
export interface OneAtATimeStagedItem {
  /** A client-local identifier for this staged item (React keys, removal) — never a real `DraftItemRecord.id`; that's only minted at `finalizeOneAtATimeDraft` time. */
  localId: string;
  filmId: string;
  /** `null` only if a future source without a watchlist entry is ever added (see `DraftItemRecord.watchlistEntryId`'s own doc comment) — every source this phase supports (random/manual/challenge) always has one. */
  watchlistEntryId: string | null;
  source: OneAtATimeItemSource;
  challengeId: string | null;
  challengeDisplayValue: Record<string, unknown> | null;
  title: string;
  releaseYear: number | null;
  /** Display-only — never read by `finalizeOneAtATimeDraft` (posters have no bearing on persistence), just carried along so "Your Draft So Far" can render a real poster grid without a re-fetch. */
  posterUrl: string | null;
}

/** Whether `filmId` is already staged — the one duplicate-prevention check every source path (Random, Choose My Own, Challenge) must run before letting a candidate be confirmed. Stable film-id comparison, never title matching. */
export function isFilmAlreadyStaged(
  staged: readonly OneAtATimeStagedItem[],
  filmId: string,
): boolean {
  return staged.some((item) => item.filmId === filmId);
}

export type StageOneAtATimeItemResult =
  | { ok: true; staged: OneAtATimeStagedItem[] }
  | { ok: false; error: "duplicate_film" };

/**
 * Appends a newly-confirmed item to the staging list — pure and
 * side-effect-free, so the calling hook can treat it as a plain reducer
 * step. Refuses a film already staged rather than trusting every source
 * path to have checked first (see `isFilmAlreadyStaged`); callers should
 * still pre-filter their own candidate pools so this rejection is never
 * actually reachable in normal use, but the guard stays authoritative
 * either way.
 */
export function stageOneAtATimeItem(
  staged: readonly OneAtATimeStagedItem[],
  item: OneAtATimeStagedItem,
): StageOneAtATimeItemResult {
  if (isFilmAlreadyStaged(staged, item.filmId)) {
    return { ok: false, error: "duplicate_film" };
  }
  return { ok: true, staged: [...staged, item] };
}

/** Removes one staged item by its local id — lets "Your Draft So Far" support taking a film back out before pressing Done. */
export function removeStagedOneAtATimeItem(
  staged: readonly OneAtATimeStagedItem[],
  localId: string,
): OneAtATimeStagedItem[] {
  return staged.filter((item) => item.localId !== localId);
}

/**
 * "Done" is available the moment at least one film has been staged (see
 * docs/updates §12/§13) — never a fixed size, and never zero.
 */
export function canFinalizeOneAtATimeDraft(
  staged: readonly OneAtATimeStagedItem[],
): boolean {
  return staged.length > 0;
}
