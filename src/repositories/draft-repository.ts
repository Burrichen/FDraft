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
  getActiveOrExpiredDraft(profileId: string): Promise<DraftRecord | null>;
  getById(profileId: string, draftId: string): Promise<DraftRecord | null>;
  listArchived(profileId: string): Promise<DraftRecord[]>;
  /** Every draft this profile owns, regardless of status — active, expired, and archived. Used by full-profile operations (backup export) that need the complete picture, unlike the history page's `listArchived`. */
  listAllForProfile(profileId: string): Promise<DraftRecord[]>;
  hasActiveDraft(profileId: string): Promise<boolean>;
  createDraft(draft: DraftRecord): Promise<void>;
  updateDraft(draft: DraftRecord): Promise<void>;

  listItemsForDraft(draftId: string): Promise<DraftItemRecord[]>;
  getItemById(itemId: string): Promise<DraftItemRecord | null>;
  createItems(items: DraftItemRecord[]): Promise<void>;
  updateItem(item: DraftItemRecord): Promise<void>;
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
