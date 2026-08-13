/**
 * Whether/when to check for a desktop update — deliberately
 * INSTALLATION-level, not per-profile. Update checking talks to GitHub,
 * not to any one profile's data, and this device only has one installed
 * copy of FDraft regardless of how many local profiles use it — scoping
 * this to a profile would mean re-checking (and re-showing the dialog)
 * every time someone switches profiles, for a question that has nothing
 * to do with which profile is active. Same rationale and the same
 * mechanism as `active-profile-pointer.ts`'s "last active profile"
 * pointer: a small, non-critical, device-local preference, not user data
 * (see docs/product-spec.md, "LOCAL DATABASE" — "Do NOT store the main
 * FDraft dataset in localStorage"), so losing it is harmless — worst case,
 * FDraft re-checks for an update it already knew about.
 */
export interface UpdatePreferenceStore {
  /** Defaults to `true` (see "UPDATE SETTING": "Default: Automatically check for updates = ON") when nothing has been stored yet. */
  getAutoCheckEnabled(): boolean;
  setAutoCheckEnabled(enabled: boolean): void;
  /** ISO 8601, or `null` if a check has never completed. */
  getLastCheckedAt(): string | null;
  setLastCheckedAt(iso: string): void;
}

const AUTO_CHECK_KEY = "fdraft:update-auto-check-enabled";
const LAST_CHECKED_KEY = "fdraft:update-last-checked-at";

export class LocalStorageUpdatePreferenceStore implements UpdatePreferenceStore {
  getAutoCheckEnabled(): boolean {
    const stored = window.localStorage.getItem(AUTO_CHECK_KEY);
    return stored === null ? true : stored === "true";
  }

  setAutoCheckEnabled(enabled: boolean): void {
    window.localStorage.setItem(AUTO_CHECK_KEY, String(enabled));
  }

  getLastCheckedAt(): string | null {
    return window.localStorage.getItem(LAST_CHECKED_KEY);
  }

  setLastCheckedAt(iso: string): void {
    window.localStorage.setItem(LAST_CHECKED_KEY, iso);
  }
}

/** An in-memory stand-in for tests and any environment without `window`. */
export class InMemoryUpdatePreferenceStore implements UpdatePreferenceStore {
  private autoCheckEnabled: boolean | null = null;
  private lastCheckedAt: string | null = null;

  getAutoCheckEnabled(): boolean {
    return this.autoCheckEnabled ?? true;
  }

  setAutoCheckEnabled(enabled: boolean): void {
    this.autoCheckEnabled = enabled;
  }

  getLastCheckedAt(): string | null {
    return this.lastCheckedAt;
  }

  setLastCheckedAt(iso: string): void {
    this.lastCheckedAt = iso;
  }
}
