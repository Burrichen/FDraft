import type {
  DraftItemEntrySource,
  DraftItemRecord,
  DraftItemSource,
  DraftMutationItemSnapshot,
  DraftMutationRecord,
  DraftRecord,
} from "@/repositories/records";
import { DIFFICULTIES } from "./difficulty";

/**
 * The hard ceiling on how many films one Draft may hold at once (see
 * docs/updates, "FDRAFT v1.2.1 — LIVING DRAFTS" §3). Applies to every add
 * path — normal, DIY, Event — and is enforced in the mutation layer, never
 * only in the UI, so no caller can silently exceed it.
 *
 * Deliberately larger than the largest difficulty (Hardcore, 20): a Living
 * Draft is allowed to grow past its original target, just not without
 * limit.
 */
export const MAX_DRAFT_FILMS = 30;

/** How many reversible mutations one Draft remembers (see `DraftMutationRecord`). The oldest is discarded once a sixth arrives. */
export const MAX_DRAFT_MUTATION_HISTORY = 5;

export type DraftCapacityRefusal = "at_capacity";

export interface DraftCapacity {
  currentFilmCount: number;
  maxFilmCount: number;
  /** How many more films this Draft could take — never negative, even for a Draft that somehow already exceeds the cap. */
  remaining: number;
  canAddFilm: boolean;
  /** Why not, when `canAddFilm` is false. `null` when it is true. */
  refusal: DraftCapacityRefusal | null;
}

/**
 * Whether a Draft can accept another film, and how much room is left —
 * THE shared answer for both the mutation layer's enforcement and the UI's
 * enable/disable state (§3: "Provide reusable logic for the UI to
 * determine whether another film can be added"), so the two can never
 * disagree.
 *
 * Takes the CURRENT film count rather than a `DraftRecord`, because the
 * authoritative count is the number of items that actually exist — see
 * `resolveCurrentDraftFilmCount` for why `DraftRecord.totalFilms` is not
 * trusted for this on its own.
 */
export function resolveDraftCapacity(currentFilmCount: number): DraftCapacity {
  const remaining = Math.max(0, MAX_DRAFT_FILMS - currentFilmCount);
  return {
    currentFilmCount,
    maxFilmCount: MAX_DRAFT_FILMS,
    remaining,
    canAddFilm: remaining > 0,
    refusal: remaining > 0 ? null : "at_capacity",
  };
}

/**
 * A Draft's CURRENT size, counted from its items.
 *
 * `DraftRecord.totalFilms` is maintained alongside them and should agree,
 * but the items are the real membership: a Draft's completion, progress
 * and Stats all read them directly, and `totalFilms` is a denormalised
 * convenience that a pre-Living-Drafts record could have drifted on. Where
 * both are available, prefer this.
 */
export function resolveCurrentDraftFilmCount(
  items: readonly DraftItemRecord[],
): number {
  return items.length;
}

/**
 * What this Draft was targeting when it was created — its identity, which
 * never changes even as the Draft grows (§3).
 *
 * Prefers the persisted `originalTargetFilms`. For a legacy record without
 * it, falls back to the difficulty's own fixed count, and finally to the
 * Draft's recorded `totalFilms` for the two difficulties that have no
 * fixed count at all (One At A Time, and legacy Freeform).
 */
export function resolveOriginalTargetFilms(
  draft: Pick<DraftRecord, "difficulty" | "totalFilms" | "originalTargetFilms">,
): number {
  if (typeof draft.originalTargetFilms === "number") {
    return draft.originalTargetFilms;
  }
  return DIFFICULTIES[draft.difficulty].filmCount ?? draft.totalFilms;
}

/**
 * Whether a Draft has grown beyond (or shrunk below) the size it was
 * created at — the one thing a UI needs to decide whether to say anything
 * about size at all.
 */
export function hasDraftChangedSize(
  draft: Pick<DraftRecord, "difficulty" | "totalFilms" | "originalTargetFilms">,
  items: readonly DraftItemRecord[],
): boolean {
  return (
    resolveCurrentDraftFilmCount(items) !== resolveOriginalTargetFilms(draft)
  );
}

/**
 * Appends a mutation to a Draft's history, discarding the oldest entries
 * once it exceeds `MAX_DRAFT_MUTATION_HISTORY` (§5). Pure — callers
 * persist the result as part of their own draft write, so appending and
 * pruning are always one atomic change.
 */
export function appendDraftMutation(
  history: readonly DraftMutationRecord[] | null | undefined,
  mutation: DraftMutationRecord,
): DraftMutationRecord[] {
  return [...(history ?? []), mutation].slice(-MAX_DRAFT_MUTATION_HISTORY);
}

/** The mutation Undo would reverse next, or `null` when there is nothing to undo. */
export function resolveUndoableDraftMutation(
  draft: Pick<DraftRecord, "mutationHistory">,
): DraftMutationRecord | null {
  const history = draft.mutationHistory ?? [];
  return history.length > 0 ? history[history.length - 1] : null;
}

export type DraftUndoRefusal = "draft_not_undoable" | "nothing_to_undo";

/** A discriminated union so a `canUndo: true` result carries its `mutation` without any caller needing a non-null assertion. */
export type DraftUndoAvailability =
  | { canUndo: true; mutation: DraftMutationRecord; refusal: null }
  | { canUndo: false; mutation: null; refusal: DraftUndoRefusal };

/**
 * Whether this Draft has anything to undo right now — THE shared answer
 * for both `undoLastDraftMutation`'s own guard and the UI's enable/disable
 * state, so the button and the mutation can never disagree (the same
 * single-source rule `resolveDraftCapacity` follows for §3).
 *
 * `"archived"` counts as undoable alongside `"active"`: §6 exists precisely
 * because the film being taken back out may since have been watched, and
 * watching the last outstanding film is what archives a Draft — so
 * refusing archived Drafts would make "I added that by mistake" unfixable
 * in exactly the case §6 is written for. `"expired"` (its postmortem flow
 * owns those items now) and `"discarded"` are out: neither is membership
 * anyone is still editing.
 */
export function resolveDraftUndoAvailability(
  draft: Pick<DraftRecord, "status" | "mutationHistory">,
): DraftUndoAvailability {
  if (draft.status !== "active" && draft.status !== "archived") {
    return { canUndo: false, mutation: null, refusal: "draft_not_undoable" };
  }
  const mutation = resolveUndoableDraftMutation(draft);
  if (!mutation) {
    return { canUndo: false, mutation: null, refusal: "nothing_to_undo" };
  }
  return { canUndo: true, mutation, refusal: null };
}

/** Drops the newest entry — the counterpart of `appendDraftMutation`, applied once an Undo has actually succeeded. */
export function dropNewestDraftMutation(
  history: readonly DraftMutationRecord[] | null | undefined,
): DraftMutationRecord[] {
  const entries = history ?? [];
  return entries.slice(0, Math.max(0, entries.length - 1));
}

/**
 * Snapshots the reversible half of a draft item, for
 * `DraftMutationRecord.previousItem`. Watched-state fields are excluded
 * deliberately — see `DraftMutationItemSnapshot`.
 */
export function snapshotDraftItem(
  item: DraftItemRecord,
): DraftMutationItemSnapshot {
  return {
    filmId: item.filmId,
    watchlistEntryId: item.watchlistEntryId,
    source: item.source,
    entrySource: resolveDraftItemEntrySource(item),
    enteredAt: item.enteredAt ?? item.createdAt,
    challengeId: item.challengeId,
    challengeAttemptId: item.challengeAttemptId,
    challengeDisplayValue: item.challengeDisplayValue,
    originFilmId: item.originFilmId,
    substitutionReason: item.substitutionReason,
    eventCategoryKey: item.eventCategoryKey ?? null,
    orderIndex: item.orderIndex,
  };
}

/**
 * The item's own `entrySource` when it has one, and otherwise a derivation
 * from the fields that existed before it did — THE single implementation
 * of that inference, shared by the one-time schema migration (which has
 * the owning draft available and so can also recognise Event drafts) and
 * by `LocalDraftRepository`'s read-time normalization (which does not).
 *
 * Every branch is a genuine, reliable inference:
 *  - a substituted slot records WHY it was substituted, which maps exactly
 *    onto `"manual_replace"` / `"reroll"`;
 *  - Halloween's three pool sources are, by construction, Event films;
 *  - a slot carrying an `eventCategoryKey` came from an Event's curated
 *    category;
 *  - `"challenge"` and `"random"` map straight across.
 *
 * The one case that cannot be recovered is `"manual"`: DIY selection and
 * post-creation manual adds both wrote it, with nothing to tell them
 * apart. `"diy"` is chosen as the safe, non-destructive default (§1:
 * "choose the safest backwards-compatible source rather than corrupting
 * or deleting Drafts") — it is the older and far more common of the two,
 * and `draft` context lets the migration do better where it can.
 */
export function resolveDraftItemEntrySource(
  item: Pick<
    DraftItemRecord,
    "source" | "entrySource" | "substitutionReason" | "eventCategoryKey"
  >,
  draft?: Pick<DraftRecord, "sourceEventId"> | null,
): DraftItemEntrySource {
  if (item.entrySource) {
    return item.entrySource;
  }
  if (item.substitutionReason === "manual_replace") {
    return "manual_replace";
  }
  if (
    item.substitutionReason === "user_reroll" ||
    item.substitutionReason === "missing_metadata"
  ) {
    return "reroll";
  }
  if (
    item.source === "halloween-adjacent" ||
    item.source === "horror" ||
    item.source === "kitsch"
  ) {
    return "event";
  }
  if (item.eventCategoryKey) {
    return "event";
  }
  if (item.source === "challenge") {
    return "challenge";
  }
  if (item.source === "manual") {
    return "diy";
  }
  // A plain random slot — unless the owning draft is an Event draft, in
  // which case the Event generated it (Christmas/January write `"random"`
  // for their own curated picks). Only the migration passes `draft`;
  // read-time normalization deliberately does not, because it must stay a
  // pure per-item function on the repository's hot path.
  if (draft?.sourceEventId) {
    return "event";
  }
  return "random";
}

/**
 * The `entrySource` for a film staged through a One At A Time builder,
 * from the builder's own per-film `source` (§1: One At A Time is a
 * drafting METHOD, never itself a source — each staged film still arrived
 * by a real one).
 *
 * `forEvent` collapses every pick in an EVENT One At A Time draft to
 * `"event"`, whether it was rolled or hand-picked from the category
 * browser: in both cases it is the Event's own curated pool that put the
 * film in scope, and "films that came from an Event" is the distinction
 * Stats actually wants. A film hand-picked from a profile's own Watchlist
 * in a NORMAL One At A Time draft is `"diy"`, matching the DIY selection
 * grid it shares its picker with.
 */
export function resolveStagedEntrySource(
  source: DraftItemSource,
  options: { forEvent: boolean },
): DraftItemEntrySource {
  if (options.forEvent) {
    return "event";
  }
  if (source === "challenge") {
    return "challenge";
  }
  if (source === "manual") {
    return "diy";
  }
  return "random";
}

/**
 * `"franchise_order"` substitutions deliberately do NOT map to `"reroll"`
 * above — that is the ENGINE correcting its own pick at generation time,
 * not a user-initiated reroll, so such a film is still however it was
 * generated. Exported only so tests can assert that intent explicitly.
 */
export const ENGINE_ONLY_SUBSTITUTION_REASONS = ["franchise_order"] as const;
