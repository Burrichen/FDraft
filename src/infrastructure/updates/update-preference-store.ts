/**
 * Whether/when to check for a desktop update, and how to handle a found
 * update's popup — deliberately INSTALLATION-level, not per-profile.
 * Update checking talks to GitHub, not to any one profile's data, and
 * this device only has one installed copy of FDraft regardless of how
 * many local profiles use it — scoping this to a profile would mean
 * re-checking (and re-showing the dialog) every time someone switches
 * profiles, for a question that has nothing to do with which profile is
 * active. Same rationale and the same mechanism as
 * `active-profile-pointer.ts`'s "last active profile" pointer: a small,
 * non-critical, device-local preference, not user data (see
 * docs/product-spec.md, "LOCAL DATABASE" — "Do NOT store the main FDraft
 * dataset in localStorage"), so losing it is harmless — worst case,
 * FDraft re-checks for an update it already knew about, or re-shows a
 * startup popup once.
 */
export interface UpdatePreferenceStore {
  /** Defaults to `true` (see "UPDATE SETTING": "Default: Automatically check for updates = ON") when nothing has been stored yet. */
  getAutoCheckEnabled(): boolean;
  setAutoCheckEnabled(enabled: boolean): void;
  /**
   * Whether an update found by an AUTOMATIC (startup) check should pop up
   * a dialog at all — distinct from `getAutoCheckEnabled`, which governs
   * whether the check itself runs. Turning this off via the popup's
   * "Don't tell me when to upgrade!" button leaves checking running
   * silently in the background and never touches manual checking (see
   * docs/updates, v1.0.3 "Now Updating", "STARTUP UPDATE POPUP"); defaults
   * to `true`.
   */
  getStartupPromptsEnabled(): boolean;
  setStartupPromptsEnabled(enabled: boolean): void;
  /**
   * The version the startup popup last showed/was dismissed for — so
   * relaunching FDraft doesn't re-prompt about a version the user already
   * said "Later" to, while a genuinely newer version still gets its own
   * popup. `null` if no startup popup has been shown yet.
   */
  getLastPromptedVersion(): string | null;
  setLastPromptedVersion(version: string): void;
}

const AUTO_CHECK_KEY = "fdraft:update-auto-check-enabled";
const STARTUP_PROMPTS_KEY = "fdraft:update-startup-prompts-enabled";
const LAST_PROMPTED_VERSION_KEY = "fdraft:update-last-prompted-version";

export class LocalStorageUpdatePreferenceStore implements UpdatePreferenceStore {
  getAutoCheckEnabled(): boolean {
    const stored = window.localStorage.getItem(AUTO_CHECK_KEY);
    return stored === null ? true : stored === "true";
  }

  setAutoCheckEnabled(enabled: boolean): void {
    window.localStorage.setItem(AUTO_CHECK_KEY, String(enabled));
  }

  getStartupPromptsEnabled(): boolean {
    const stored = window.localStorage.getItem(STARTUP_PROMPTS_KEY);
    return stored === null ? true : stored === "true";
  }

  setStartupPromptsEnabled(enabled: boolean): void {
    window.localStorage.setItem(STARTUP_PROMPTS_KEY, String(enabled));
  }

  getLastPromptedVersion(): string | null {
    return window.localStorage.getItem(LAST_PROMPTED_VERSION_KEY);
  }

  setLastPromptedVersion(version: string): void {
    window.localStorage.setItem(LAST_PROMPTED_VERSION_KEY, version);
  }
}

/** An in-memory stand-in for tests and any environment without `window`. */
export class InMemoryUpdatePreferenceStore implements UpdatePreferenceStore {
  private autoCheckEnabled: boolean | null = null;
  private startupPromptsEnabled: boolean | null = null;
  private lastPromptedVersion: string | null = null;

  getAutoCheckEnabled(): boolean {
    return this.autoCheckEnabled ?? true;
  }

  setAutoCheckEnabled(enabled: boolean): void {
    this.autoCheckEnabled = enabled;
  }

  getStartupPromptsEnabled(): boolean {
    return this.startupPromptsEnabled ?? true;
  }

  setStartupPromptsEnabled(enabled: boolean): void {
    this.startupPromptsEnabled = enabled;
  }

  getLastPromptedVersion(): string | null {
    return this.lastPromptedVersion;
  }

  setLastPromptedVersion(version: string): void {
    this.lastPromptedVersion = version;
  }
}
