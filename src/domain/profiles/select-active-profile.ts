import type { LocalProfile } from "./profile";

/**
 * Decides whether the app can skip straight into a profile or must show the
 * profile picker (see docs/product-spec.md, "LOCAL PROFILES REPLACE REMOTE
 * ACCOUNTS" — "If there is only one profile, the app may open it
 * automatically. Do not force users through a profile-selection screen
 * every launch unless multiple local profiles exist.").
 *
 * `rememberedProfileId` is the last profile the app had open (see
 * `src/infrastructure/local-db/active-profile-pointer.ts`) — honoured only
 * when it still refers to a real, existing profile, so a deleted profile
 * can never silently resurrect itself as "the" active one.
 */
export function resolveAutoOpenProfileId(
  profiles: readonly LocalProfile[],
  rememberedProfileId: string | null,
): string | null {
  if (profiles.length === 0) {
    return null;
  }
  if (profiles.length === 1) {
    return profiles[0].id;
  }
  if (
    rememberedProfileId &&
    profiles.some((profile) => profile.id === rememberedProfileId)
  ) {
    return rememberedProfileId;
  }
  return null;
}
