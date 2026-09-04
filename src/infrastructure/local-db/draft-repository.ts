import type { DraftRepository } from "@/repositories/draft-repository";
import type {
  DraftChallengeAttemptRecord,
  DraftChallengeInteractionRecord,
  DraftItemRecord,
  DraftRecord,
} from "@/repositories/records";
import type { FDraftLocalDatabase } from "./database";

/**
 * A draft written before `sourceEventId`/`rewardsGrantedAt`/
 * `sourceEventManuallyEnabled`/`customName`/`eventOccurrenceYear` existed
 * has none of those properties at all (Dexie/IndexedDB don't enforce a
 * schema on non-indexed fields — see `schema.ts`'s note on `matchMethod`
 * for the same situation) — normalize to their sensible defaults at the
 * one chokepoint every read passes through, so nothing downstream ever
 * has to treat `undefined` as a third state alongside `string | null`/
 * `boolean | null`/`number | null`.
 */
function normalizeDraft(draft: DraftRecord): DraftRecord {
  return {
    ...draft,
    sourceEventId: draft.sourceEventId ?? null,
    rewardsGrantedAt: draft.rewardsGrantedAt ?? null,
    sourceEventManuallyEnabled: draft.sourceEventManuallyEnabled ?? null,
    customName: draft.customName ?? null,
    eventOccurrenceYear: draft.eventOccurrenceYear ?? null,
  };
}

/** Same backward-compatibility rationale as `normalizeDraft`, for the selection-provenance fields v1.0.2 added, plus `eventRewardGrantedAt` (see that field's own doc comment in `records.ts`). */
function normalizeDraftItem(item: DraftItemRecord): DraftItemRecord {
  return {
    ...item,
    originFilmId: item.originFilmId ?? null,
    substitutionReason: item.substitutionReason ?? null,
    eventRewardGrantedAt: item.eventRewardGrantedAt ?? null,
  };
}

export class LocalDraftRepository implements DraftRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  async getActiveOrExpiredDraft(
    profileId: string,
    sourceEventId: string | null,
  ): Promise<DraftRecord | null> {
    const drafts = await this.db.drafts
      .where("profileId")
      .equals(profileId)
      .and(
        (draft) =>
          (draft.status === "active" || draft.status === "expired") &&
          (draft.sourceEventId ?? null) === sourceEventId,
      )
      .toArray();
    if (drafts.length === 0) {
      return null;
    }
    drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return normalizeDraft(drafts[0]);
  }

  async getById(
    profileId: string,
    draftId: string,
  ): Promise<DraftRecord | null> {
    const draft = await this.db.drafts.get(draftId);
    return draft && draft.profileId === profileId
      ? normalizeDraft(draft)
      : null;
  }

  async listArchived(profileId: string): Promise<DraftRecord[]> {
    const drafts = await this.db.drafts
      .where("[profileId+status]")
      .equals([profileId, "archived"])
      .toArray();
    return drafts
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(normalizeDraft);
  }

  async listAllForProfile(profileId: string): Promise<DraftRecord[]> {
    const drafts = await this.db.drafts
      .where("profileId")
      .equals(profileId)
      .toArray();
    return drafts
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(normalizeDraft);
  }

  async listActiveDrafts(profileId: string): Promise<DraftRecord[]> {
    const drafts = await this.db.drafts
      .where("[profileId+status]")
      .equals([profileId, "active"])
      .toArray();
    return drafts.map(normalizeDraft);
  }

  async hasActiveDraft(
    profileId: string,
    sourceEventId: string | null,
  ): Promise<boolean> {
    const drafts = await this.db.drafts
      .where("[profileId+status]")
      .equals([profileId, "active"])
      .toArray();
    return drafts.some(
      (draft) => (draft.sourceEventId ?? null) === sourceEventId,
    );
  }

  async createDraft(draft: DraftRecord): Promise<void> {
    await this.db.drafts.add(draft);
  }

  async updateDraft(draft: DraftRecord): Promise<void> {
    await this.db.drafts.put(draft);
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.db.transaction(
      "rw",
      [
        this.db.drafts,
        this.db.draftItems,
        this.db.draftChallengeAttempts,
        this.db.draftChallengeInteractions,
        this.db.draftPostmortemResponses,
      ],
      async () => {
        await this.db.draftItems.where("draftId").equals(draftId).delete();
        await this.db.draftChallengeAttempts
          .where("draftId")
          .equals(draftId)
          .delete();
        await this.db.draftChallengeInteractions
          .where("draftId")
          .equals(draftId)
          .delete();
        await this.db.draftPostmortemResponses
          .where("draftId")
          .equals(draftId)
          .delete();
        await this.db.drafts.delete(draftId);
      },
    );
  }

  async listItemsForDraft(draftId: string): Promise<DraftItemRecord[]> {
    const items = await this.db.draftItems
      .where("draftId")
      .equals(draftId)
      .toArray();
    return items
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(normalizeDraftItem);
  }

  async getItemById(itemId: string): Promise<DraftItemRecord | null> {
    const item = await this.db.draftItems.get(itemId);
    return item ? normalizeDraftItem(item) : null;
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
    const items = await this.db.draftItems
      .where("watchlistEntryId")
      .equals(watchlistEntryId)
      .toArray();
    return items.map(normalizeDraftItem);
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
