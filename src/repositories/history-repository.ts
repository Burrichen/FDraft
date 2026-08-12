import type {
  DraftPostmortemResponseRecord,
  SelectionWeightAdjustmentRecord,
  UserRatingRecord,
  WatchedHistoryRecord,
} from "./records";

/**
 * Everything that makes up a profile's permanent record (see
 * docs/product-spec.md, "DRAFT HISTORY", "SELECTION WEIGHTS"): watched
 * history, personal ratings, postmortem answers, and the selection-weight
 * audit trail those answers produce. Kept as one repository because these
 * records only ever get *appended to*, never edited in place — the
 * "historical data must remain stable" requirement is a property of how
 * this repository is used, not something it needs to enforce itself.
 */
export interface HistoryRepository {
  addWatchedHistory(entry: WatchedHistoryRecord): Promise<void>;
  listWatchedHistory(profileId: string): Promise<WatchedHistoryRecord[]>;
  /**
   * Removes exactly one watched-history record by id — the sole, deliberate
   * exception to "these records only ever get appended to" (see
   * docs/product-spec.md, "WATCHED FILM UNDO"). Only ever called with the id
   * of a record created earlier in the *same application session*, to
   * reverse that specific action — never used to edit or clean up older,
   * legitimate history.
   */
  deleteWatchedHistory(id: string): Promise<void>;

  upsertRating(rating: UserRatingRecord): Promise<void>;
  listRatings(profileId: string): Promise<UserRatingRecord[]>;

  addPostmortemResponse(response: DraftPostmortemResponseRecord): Promise<void>;
  /** `null` if this draft item has no recorded response yet — the idempotency check for `submitPostmortemResponse`. */
  getPostmortemResponseForItem(
    draftItemId: string,
  ): Promise<DraftPostmortemResponseRecord | null>;
  listPostmortemResponsesForDraft(
    draftId: string,
  ): Promise<DraftPostmortemResponseRecord[]>;

  addSelectionWeightAdjustment(
    adjustment: SelectionWeightAdjustmentRecord,
  ): Promise<void>;
  listSelectionWeightAdjustments(
    watchlistEntryId: string,
  ): Promise<SelectionWeightAdjustmentRecord[]>;
}
