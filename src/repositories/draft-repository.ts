import type {
  DraftChallengeAttemptRecord,
  DraftChallengeInteractionRecord,
  DraftItemRecord,
  DraftRecord,
} from "./records";

/**
 * A profile's drafts, draft items, and everything the challenge engine logs
 * along the way (see docs/product-spec.md, "MONTHLY WATCHLIST DRAFTS",
 * "CHALLENGE ARCHITECTURE"). This is the interface the local draft
 * application service (`src/application/drafts`) programs against instead
 * of the Postgres RPCs (`create_draft`, `add_draft_films`,
 * `add_draft_challenge_items`, `expire_draft_if_due`,
 * `archive_draft_if_resolved`, `submit_draft_postmortem_response`,
 * `resolve_draft_challenge_interaction`) it replaces — those functions'
 * atomicity guarantees become the local implementation's
 * `Dexie.transaction(...)` blocks instead, but the *decisions* they made
 * (which item to complete, whether a draft is resolved, what a postmortem
 * response does) still live entirely in TypeScript, in the application
 * service, never duplicated into the repository layer.
 */
export interface DraftRepository {
  /**
   * The profile's current active-or-expired draft WITHIN ONE SCOPE — see
   * docs/updates, "PROMPT B2.1 — DUAL DRAFT ARCHITECTURE": a normal Draft
   * (`sourceEventId: null`) and an event's own Draft (`sourceEventId:
   * "halloween"`, etc.) are independent and can both be active at once, so
   * every caller must say which one it means. `sourceEventId` is matched
   * exactly against `DraftRecord.sourceEventId` — never inferred from a
   * route or page title (see `DraftRecord.sourceEventId`'s own doc
   * comment for why that field is the one source of truth here).
   */
  getActiveOrExpiredDraft(
    profileId: string,
    sourceEventId: string | null,
  ): Promise<DraftRecord | null>;
  getById(profileId: string, draftId: string): Promise<DraftRecord | null>;
  listArchived(profileId: string): Promise<DraftRecord[]>;
  /**
   * Every past (non-active, non-discarded) draft — `"archived"` (completed:
   * every item resolved) AND `"expired"` (the deadline/Event occurrence
   * passed with some items unresolved) — for the History page (see
   * docs/updates, "FDRAFT UPDATE 1 — EVENT STATS/HISTORY/PERSISTENCE
   * AUDIT" §3/§6: History must distinguish Completed from Expired/
   * unfinished, which the existing `status`/`completedAt` fields already
   * support with zero new persistence). Excludes `"discarded"` — a
   * profile's deliberate "Say Goodbye" — same as `listArchived` always has.
   */
  listHistorical(profileId: string): Promise<DraftRecord[]>;
  /** Every draft this profile owns, regardless of status — active, expired, and archived. Used by full-profile operations (backup export) that need the complete picture, unlike the history page's `listArchived`. */
  listAllForProfile(profileId: string): Promise<DraftRecord[]>;
  /** Every currently `"active"` draft this profile owns, across every scope at once — used only where a normal Draft and an event Draft genuinely need to be considered together (see `completeMatchingActiveDraftItem` in `local-watchlist-service.ts`, "a film can theoretically appear in both active Drafts"). Everywhere else, prefer the scoped `getActiveOrExpiredDraft`/`hasActiveDraft`. */
  listActiveDrafts(profileId: string): Promise<DraftRecord[]>;
  /** Same scoping as `getActiveOrExpiredDraft` — whether THIS scope (normal, or one specific event) already has an active draft, never "any draft at all." */
  hasActiveDraft(
    profileId: string,
    sourceEventId: string | null,
  ): Promise<boolean>;
  createDraft(draft: DraftRecord): Promise<void>;
  updateDraft(draft: DraftRecord): Promise<void>;
  /**
   * Permanently removes this draft and everything scoped to it — items,
   * challenge attempts, challenge interactions, and postmortem responses
   * (see docs/updates, v1.0.4 "God Mode", "REGENERATE DRAFT") — mirroring
   * the cascading delete `DataErasureRepository.eraseProfileCompletely`
   * already does per-profile, scoped to one draft instead. Never touches
   * `selectionWeightAdjustments`: those are a longer-lived,
   * watchlist-entry-level signal from postmortem responses, not state
   * that belongs to any one draft.
   */
  deleteDraft(draftId: string): Promise<void>;

  listItemsForDraft(draftId: string): Promise<DraftItemRecord[]>;
  getItemById(itemId: string): Promise<DraftItemRecord | null>;
  createItems(items: DraftItemRecord[]): Promise<void>;
  updateItem(item: DraftItemRecord): Promise<void>;
  /**
   * Removes ONE draft item — the reversal of a single `createItems` call
   * (see `undoLastDraftMutation`, docs/updates "FDRAFT v1.2.1 — LIVING
   * DRAFTS" §5). Deliberately narrow: this exists to undo an addition the
   * draft has a recorded mutation for, NOT as general "remove a film from
   * my draft" support, which §5 explicitly excludes from this update.
   *
   * Also clears the item's own postmortem response if it somehow has one,
   * since that row is keyed uniquely to the item and would otherwise be
   * orphaned by (and block a later re-add of) the same item id.
   */
  deleteItem(itemId: string): Promise<void>;
  /** All draft items across every draft that reference this watchlist entry — used to complete the matching item when a film is marked watched. */
  findItemsByWatchlistEntryId(
    watchlistEntryId: string,
  ): Promise<DraftItemRecord[]>;

  createChallengeAttempt(attempt: DraftChallengeAttemptRecord): Promise<void>;
  listChallengeAttemptsForDraft(
    draftId: string,
  ): Promise<DraftChallengeAttemptRecord[]>;

  createInteraction(
    interaction: DraftChallengeInteractionRecord,
  ): Promise<void>;
  updateInteraction(
    interaction: DraftChallengeInteractionRecord,
  ): Promise<void>;
  getInteractionById(
    id: string,
  ): Promise<DraftChallengeInteractionRecord | null>;
  getLatestInteraction(
    draftId: string,
    challengeId: string,
  ): Promise<DraftChallengeInteractionRecord | null>;
  listPendingInteractions(
    draftId: string,
  ): Promise<DraftChallengeInteractionRecord[]>;
}
