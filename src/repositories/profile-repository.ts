import type { LocalProfile } from "@/domain/profiles/profile";

/**
 * Repository interface for local profiles (see docs/product-spec.md, "LOCAL
 * PROFILES REPLACE REMOTE ACCOUNTS"). Pure TypeScript contract — no Dexie,
 * no Supabase, no React import here or in any other file under
 * `src/repositories`. The local (IndexedDB/Dexie) implementation lives in
 * `src/infrastructure/local-db/profile-repository.ts`; a future remote-sync
 * implementation could satisfy this exact interface without the
 * application layer above it changing at all.
 */
export interface ProfileRepository {
  list(): Promise<LocalProfile[]>;
  getById(id: string): Promise<LocalProfile | null>;
  create(profile: LocalProfile): Promise<void>;
  update(profile: LocalProfile): Promise<void>;
  delete(id: string): Promise<void>;
}
