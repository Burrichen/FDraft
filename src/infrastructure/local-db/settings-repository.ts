import type { SettingsRepository } from "@/repositories/settings-repository";
import type { FDraftLocalDatabase } from "./database";

export class LocalSettingsRepository implements SettingsRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  async get<T>(profileId: string, key: string): Promise<T | null> {
    const row = await this.db.settings.get([profileId, key]);
    return (row?.value as T | undefined) ?? null;
  }

  async set<T>(profileId: string, key: string, value: T): Promise<void> {
    await this.db.settings.put({ profileId, key, value });
  }

  async remove(profileId: string, key: string): Promise<void> {
    await this.db.settings.delete([profileId, key]);
  }

  async getAll(profileId: string): Promise<Record<string, unknown>> {
    const rows = await this.db.settings
      .where("profileId")
      .equals(profileId)
      .toArray();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }
}
