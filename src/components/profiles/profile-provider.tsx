"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ProfileService } from "@/application/profiles/profile-service";
import type { LocalProfile } from "@/domain/profiles/profile";
import { LocalStorageActiveProfilePointer } from "@/infrastructure/local-db/active-profile-pointer";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { SCHEMA_VERSION } from "@/infrastructure/local-db/schema";
import type { Repositories } from "@/repositories";

interface ProfileContextValue {
  /** `undefined` while still resolving on first mount, `null` once resolved with no active profile (picker/create-profile UI should show). */
  activeProfile: LocalProfile | null | undefined;
  profiles: LocalProfile[];
  /** The one shared repository bag every application service call in the app should use — never construct a second one. */
  repositories: Repositories;
  createProfile: (
    displayName: string,
    timezone: string,
  ) => Promise<LocalProfile>;
  switchToProfile: (profileId: string) => Promise<void>;
  renameProfile: (profileId: string, displayName: string) => Promise<void>;
  /** Destructive. Callers are responsible for their own confirmation UI — this performs the deletion unconditionally. */
  deleteProfile: (profileId: string) => Promise<void>;
  /**
   * Re-reads the profile list from storage — needed after anything that
   * writes a profile row directly through `repositories` rather than
   * through this context's own methods (see
   * `src/application/backup/import-backup.ts`'s `commitBackupImport`,
   * called by the Settings "Import FDraft Backup" flow: importing as a
   * new profile creates one without ever calling `createProfile` here, so
   * without this the new profile would exist in IndexedDB but stay
   * invisible in the Profiles list and switcher until something else
   * happened to reload them).
   */
  refreshProfiles: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

/**
 * Provides the active local profile — and the one shared local repository
 * bag — to the entire app (see docs/product-spec.md, "LOCAL PROFILES
 * REPLACE REMOTE ACCOUNTS", Prompt 9.5B). This is the app's real entry
 * point now: `(app)/layout.tsx` wraps every page in this, and pages read
 * `activeProfile`/`repositories` from `useProfileContext()` instead of ever
 * touching Supabase or constructing their own repositories.
 */
export function ProfileProvider({
  children,
  databaseName,
}: {
  children: ReactNode;
  databaseName?: string;
}) {
  // Only ever read once per mounted provider — a real screen never remounts
  // this with a different name, only tests do (one unique name per test, to
  // keep each test's IndexedDB state isolated from the others).
  const { service, repositories } = useMemo(() => {
    const repos = createLocalRepositories(
      databaseName ? new FDraftLocalDatabase(databaseName) : undefined,
    );
    const pointer = new LocalStorageActiveProfilePointer();
    return {
      repositories: repos,
      service: new ProfileService({
        profiles: repos.profiles,
        dataErasure: repos.dataErasure,
        pointer,
        currentSchemaVersion: SCHEMA_VERSION,
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<
    LocalProfile | null | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [initial, list] = await Promise.all([
        service.resolveInitialProfile(),
        service.listProfiles(),
      ]);
      if (cancelled) return;
      setActiveProfile(initial);
      setProfiles(list);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [service]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      activeProfile,
      profiles,
      repositories,
      async createProfile(displayName, timezone) {
        const profile = await service.createProfile(displayName, timezone);
        setProfiles(await service.listProfiles());
        return profile;
      },
      async switchToProfile(profileId) {
        const profile = await service.switchToProfile(profileId);
        setActiveProfile(profile);
        setProfiles(await service.listProfiles());
      },
      async renameProfile(profileId, displayName) {
        const updated = await service.renameProfile(profileId, displayName);
        setProfiles(await service.listProfiles());
        setActiveProfile((current) =>
          current?.id === profileId ? updated : current,
        );
      },
      async refreshProfiles() {
        setProfiles(await service.listProfiles());
      },
      async deleteProfile(profileId) {
        const wasActive = activeProfile?.id === profileId;
        await service.deleteProfile(profileId);
        const remaining = await service.listProfiles();
        setProfiles(remaining);
        if (wasActive) {
          // Re-run the same auto-open/picker decision resolveInitialProfile
          // makes on launch: one profile left -> open it; several with no
          // remembered choice, or none left -> show the picker again.
          setActiveProfile(await service.resolveInitialProfile());
        }
      },
    }),
    [service, repositories, activeProfile, profiles],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfileContext(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfileContext must be used within a ProfileProvider");
  }
  return context;
}
