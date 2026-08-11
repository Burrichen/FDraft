/**
 * Small, arbitrary profile-scoped preferences that don't belong on the core
 * `LocalProfile` record itself (see `src/domain/profiles/profile.ts` for
 * the handful of settings that *do* — timezone, reduced motion). Backed by
 * the local database, not `localStorage` (see docs/product-spec.md, "LOCAL
 * DATABASE" — "Do NOT store the main FDraft dataset in localStorage"); the
 * one deliberate exception is the tiny "which profile was last open"
 * pointer (`src/infrastructure/local-db/active-profile-pointer.ts`), which
 * is genuinely a non-critical, device-local preference rather than user
 * data.
 */
export interface SettingsRepository {
  get<T>(profileId: string, key: string): Promise<T | null>;
  set<T>(profileId: string, key: string, value: T): Promise<void>;
  remove(profileId: string, key: string): Promise<void>;
  getAll(profileId: string): Promise<Record<string, unknown>>;
}
