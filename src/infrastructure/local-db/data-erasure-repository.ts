import type { DataErasureRepository } from "@/repositories/data-erasure-repository";
import type { FDraftLocalDatabase } from "./database";

export class LocalDataErasureRepository implements DataErasureRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  async eraseProfileCompletely(profileId: string): Promise<void> {
    await this.db.transaction(
      "rw",
      [
        this.db.profiles,
        this.db.watchlistEntries,
        this.db.watchlistImports,
        this.db.watchedHistory,
        this.db.userRatings,
        this.db.drafts,
        this.db.draftItems,
        this.db.draftChallengeAttempts,
        this.db.draftChallengeInteractions,
        this.db.draftPostmortemResponses,
        this.db.selectionWeightAdjustments,
        this.db.settings,
        this.db.pointBalances,
      ],
      async () => {
        const entryIds = await this.db.watchlistEntries
          .where("profileId")
          .equals(profileId)
          .primaryKeys();
        const draftIds = await this.db.drafts
          .where("profileId")
          .equals(profileId)
          .primaryKeys();

        if (entryIds.length > 0) {
          await this.db.selectionWeightAdjustments
            .where("watchlistEntryId")
            .anyOf(entryIds)
            .delete();
        }
        if (draftIds.length > 0) {
          await this.db.draftItems.where("draftId").anyOf(draftIds).delete();
          await this.db.draftChallengeAttempts
            .where("draftId")
            .anyOf(draftIds)
            .delete();
          await this.db.draftChallengeInteractions
            .where("draftId")
            .anyOf(draftIds)
            .delete();
          await this.db.draftPostmortemResponses
            .where("draftId")
            .anyOf(draftIds)
            .delete();
        }

        await this.db.drafts.where("profileId").equals(profileId).delete();
        await this.db.watchlistEntries
          .where("profileId")
          .equals(profileId)
          .delete();
        await this.db.watchlistImports
          .where("profileId")
          .equals(profileId)
          .delete();
        await this.db.watchedHistory
          .where("profileId")
          .equals(profileId)
          .delete();
        await this.db.userRatings.where("profileId").equals(profileId).delete();
        await this.db.settings.where("profileId").equals(profileId).delete();
        await this.db.pointBalances
          .where("profileId")
          .equals(profileId)
          .delete();
        await this.db.profiles.delete(profileId);
      },
    );
  }
}
