import type { DraftRepository } from "@/repositories/draft-repository";
import type {
  DraftChallengeAttemptRecord,
  DraftChallengeInteractionRecord,
  DraftItemRecord,
  DraftRecord,
} from "@/repositories/records";
import type { FDraftLocalDatabase } from "./database";

export class LocalDraftRepository implements DraftRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  async getActiveOrExpiredDraft(
    profileId: string,
  ): Promise<DraftRecord | null> {
    const drafts = await this.db.drafts
      .where("profileId")
      .equals(profileId)
      .and((draft) => draft.status === "active" || draft.status === "expired")
      .toArray();
    if (drafts.length === 0) {
      return null;
    }
    drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return drafts[0];
  }

  async getById(
    profileId: string,
    draftId: string,
  ): Promise<DraftRecord | null> {
    const draft = await this.db.drafts.get(draftId);
    return draft && draft.profileId === profileId ? draft : null;
  }

  async listArchived(profileId: string): Promise<DraftRecord[]> {
    const drafts = await this.db.drafts
      .where("[profileId+status]")
      .equals([profileId, "archived"])
      .toArray();
    return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listAllForProfile(profileId: string): Promise<DraftRecord[]> {
    const drafts = await this.db.drafts
      .where("profileId")
      .equals(profileId)
      .toArray();
    return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async hasActiveDraft(profileId: string): Promise<boolean> {
    const count = await this.db.drafts
      .where("[profileId+status]")
      .equals([profileId, "active"])
      .count();
    return count > 0;
  }

  async createDraft(draft: DraftRecord): Promise<void> {
    await this.db.drafts.add(draft);
  }

  async updateDraft(draft: DraftRecord): Promise<void> {
    await this.db.drafts.put(draft);
  }

  async listItemsForDraft(draftId: string): Promise<DraftItemRecord[]> {
    const items = await this.db.draftItems
      .where("draftId")
      .equals(draftId)
      .toArray();
    return items.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async getItemById(itemId: string): Promise<DraftItemRecord | null> {
    const item = await this.db.draftItems.get(itemId);
    return item ?? null;
  }

  async createItems(items: DraftItemRecord[]): Promise<void> {
    if (items.length === 0) {
      return;
    }
    await this.db.draftItems.bulkAdd(items);
  }

  async updateItem(item: DraftItemRecord): Promise<void> {
    await this.db.draftItems.put(item);
  }

  async findItemsByWatchlistEntryId(
    watchlistEntryId: string,
  ): Promise<DraftItemRecord[]> {
    return this.db.draftItems
      .where("watchlistEntryId")
      .equals(watchlistEntryId)
      .toArray();
  }

  async createChallengeAttempt(
    attempt: DraftChallengeAttemptRecord,
  ): Promise<void> {
    await this.db.draftChallengeAttempts.add(attempt);
  }

  async listChallengeAttemptsForDraft(
    draftId: string,
  ): Promise<DraftChallengeAttemptRecord[]> {
    return this.db.draftChallengeAttempts
      .where("draftId")
      .equals(draftId)
      .toArray();
  }

  async createInteraction(
    interaction: DraftChallengeInteractionRecord,
  ): Promise<void> {
    await this.db.draftChallengeInteractions.add(interaction);
  }

  async updateInteraction(
    interaction: DraftChallengeInteractionRecord,
  ): Promise<void> {
    await this.db.draftChallengeInteractions.put(interaction);
  }

  async getInteractionById(
    id: string,
  ): Promise<DraftChallengeInteractionRecord | null> {
    const interaction = await this.db.draftChallengeInteractions.get(id);
    return interaction ?? null;
  }

  async getLatestInteraction(
    draftId: string,
    challengeId: string,
  ): Promise<DraftChallengeInteractionRecord | null> {
    const interactions = await this.db.draftChallengeInteractions
      .where("[draftId+challengeId]")
      .equals([draftId, challengeId])
      .toArray();
    if (interactions.length === 0) {
      return null;
    }
    interactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return interactions[0];
  }

  async listPendingInteractions(
    draftId: string,
  ): Promise<DraftChallengeInteractionRecord[]> {
    return this.db.draftChallengeInteractions
      .where("draftId")
      .equals(draftId)
      .and((interaction) => interaction.status === "in_progress")
      .toArray();
  }
}
