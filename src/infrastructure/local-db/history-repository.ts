import type { HistoryRepository } from "@/repositories/history-repository";
import type {
  DraftPostmortemResponseRecord,
  SelectionWeightAdjustmentRecord,
  UserRatingRecord,
  WatchedHistoryRecord,
} from "@/repositories/records";
import type { FDraftLocalDatabase } from "./database";

export class LocalHistoryRepository implements HistoryRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  async addWatchedHistory(entry: WatchedHistoryRecord): Promise<void> {
    await this.db.watchedHistory.add(entry);
  }

  async listWatchedHistory(profileId: string): Promise<WatchedHistoryRecord[]> {
    return this.db.watchedHistory
      .where("profileId")
      .equals(profileId)
      .toArray();
  }

  async deleteWatchedHistory(id: string): Promise<void> {
    await this.db.watchedHistory.delete(id);
  }

  async upsertRating(rating: UserRatingRecord): Promise<void> {
    const existing = await this.db.userRatings
      .where("[profileId+filmId]")
      .equals([rating.profileId, rating.filmId])
      .first();
    await this.db.userRatings.put(
      existing ? { ...rating, id: existing.id } : rating,
    );
  }

  async listRatings(profileId: string): Promise<UserRatingRecord[]> {
    return this.db.userRatings.where("profileId").equals(profileId).toArray();
  }

  async addPostmortemResponse(
    response: DraftPostmortemResponseRecord,
  ): Promise<void> {
    // `&draftItemId` is a unique index (see schema.ts) — Dexie/IndexedDB
    // rejects a second insert for the same draft item with a
    // ConstraintError, which is the actual idempotency enforcement.
    // Application services must catch that error, not treat it as an
    // unexpected failure — see `submitLocalPostmortemResponse`.
    await this.db.draftPostmortemResponses.add(response);
  }

  async getPostmortemResponseForItem(
    draftItemId: string,
  ): Promise<DraftPostmortemResponseRecord | null> {
    const response = await this.db.draftPostmortemResponses
      .where("draftItemId")
      .equals(draftItemId)
      .first();
    return response ?? null;
  }

  async listPostmortemResponsesForDraft(
    draftId: string,
  ): Promise<DraftPostmortemResponseRecord[]> {
    return this.db.draftPostmortemResponses
      .where("draftId")
      .equals(draftId)
      .toArray();
  }

  async addSelectionWeightAdjustment(
    adjustment: SelectionWeightAdjustmentRecord,
  ): Promise<void> {
    await this.db.selectionWeightAdjustments.add(adjustment);
  }

  async listSelectionWeightAdjustments(
    watchlistEntryId: string,
  ): Promise<SelectionWeightAdjustmentRecord[]> {
    return this.db.selectionWeightAdjustments
      .where("watchlistEntryId")
      .equals(watchlistEntryId)
      .toArray();
  }
}
