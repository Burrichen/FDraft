import type { LocalProfile } from "@/domain/profiles/profile";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { FDraftLocalDatabase } from "./database";

export class LocalProfileRepository implements ProfileRepository {
  constructor(private readonly db: FDraftLocalDatabase) {}

  async list(): Promise<LocalProfile[]> {
    return this.db.profiles.toArray();
  }

  async getById(id: string): Promise<LocalProfile | null> {
    const profile = await this.db.profiles.get(id);
    return profile ?? null;
  }

  async create(profile: LocalProfile): Promise<void> {
    await this.db.profiles.add(profile);
  }

  async update(profile: LocalProfile): Promise<void> {
    await this.db.profiles.put(profile);
  }

  async delete(id: string): Promise<void> {
    await this.db.profiles.delete(id);
  }
}
