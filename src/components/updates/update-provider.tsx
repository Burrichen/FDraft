"use client";

import { getVersion } from "@tauri-apps/api/app";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  relaunchApp,
  type InstallProgress,
  type UpdateHandle,
  type UpdateInfo,
} from "@/application/updates/tauri-updater";
import { shouldAutoCheckForUpdate } from "@/domain/updates/update-check-policy";
import {
  selectSkippedReleases,
  type SkippedRelease,
} from "@/domain/updates/skipped-releases";
import { isDesktopRuntime } from "@/infrastructure/tauri/desktop-runtime";
import { fetchPublishedReleases } from "@/infrastructure/updates/github-releases-client";
import {
  LocalStorageUpdatePreferenceStore,
  type UpdatePreferenceStore,
} from "@/infrastructure/updates/update-preference-store";

/** Which action found the update — governs whether the popup's "Don't tell me when to upgrade!" option makes sense at all (see `update-dialog.tsx`) and whether dismissing it should remember the version (see `update-provider.tsx`'s `dismiss`). */
export type UpdateSource = "startup" | "manual";

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | {
      phase: "available";
      info: UpdateInfo;
      source: UpdateSource;
      /**
       * Any published release between the installed version and `info`'s
       * — a one-click update already jumps straight to the latest version
       * regardless (Tauri's updater always targets GitHub's "latest"
       * release directly, never a chain of intermediate ones), but
       * without this, someone updating from e.g. v1.0.1 to v1.0.3 would
       * never see what v1.0.2 itself changed. Starts empty and fills in
       * once `fetchPublishedReleases` resolves — see docs/updates, v1.0.3
       * "Now Updating", "MULTI-VERSION UPDATE JUMPS". Never blocks
       * showing the dialog itself.
       */
      skippedReleases: SkippedRelease[];
    }
  | { phase: "downloading"; progress: InstallProgress | null }
  | { phase: "ready-to-restart" }
  | { phase: "error"; message: string };

interface UpdateContextValue {
  state: UpdateState;
  /** `null` on the web build, or before the desktop app's own version has resolved. */
  currentVersion: string | null;
  autoCheckEnabled: boolean;
  setAutoCheckEnabled: (enabled: boolean) => void;
  /** Whether an update found by the automatic startup check pops up a dialog at all — separate from `autoCheckEnabled`, which governs whether the check itself runs (see docs/updates, v1.0.3 "Now Updating"). */
  startupPromptsEnabled: boolean;
  setStartupPromptsEnabled: (enabled: boolean) => void;
  /** Always runs regardless of `autoCheckEnabled` or `startupPromptsEnabled` — the Settings page's "Check for Updates" button, and errors here ARE surfaced (see docs/product-spec.md, "UPDATE SETTING": "manual Check for Updates still works"). */
  checkNow: () => Promise<void>;
  installUpdate: () => Promise<void>;
  /** "Later"/closing the dialog. For a startup-triggered popup, this also remembers the version so it won't be re-prompted on the next launch — a genuinely newer version still gets its own popup. */
  dismiss: () => void;
  /** The popup's "Don't tell me when to upgrade!" — suppresses future startup popups until changed again in Settings; never touches `autoCheckEnabled` or manual checking. */
  disableStartupPrompts: () => void;
  restartNow: () => Promise<void>;
  restartLater: () => void;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

/**
 * Desktop-only update-checking state machine (see docs/product-spec.md,
 * "USER-FRIENDLY AUTO-UPDATES"). A no-op everywhere else: `checkNow` and
 * `installUpdate` simply do nothing outside `isDesktopRuntime()`, since
 * there is no updater to talk to on the web build (the browser always
 * serves the latest deploy).
 *
 * Runs at most one AUTOMATIC check per app session (see
 * `update-check-policy.ts` — as of v1.0.3 "Now Updating", every startup
 * checks; there is no cross-session cooldown to skip a startup with) —
 * never blocks startup (it's fired from an effect, after first paint) and
 * never surfaces an error to the user (a failed automatic check just
 * quietly does nothing; only a manual "Check for Updates" click surfaces
 * its own failure). Mounted once at the app-shell level (like
 * `WatchUndoProvider`) so the "available"/"downloading"/"ready-to-restart"
 * dialog can appear regardless of which page is open, and survives
 * navigation between pages without re-checking.
 */
export function UpdateProvider({
  children,
  store: storeOverride,
}: {
  children: ReactNode;
  store?: UpdatePreferenceStore;
}) {
  // A stable instance for this component's lifetime — NOT a default
  // parameter (`store = new LocalStorageUpdatePreferenceStore()`), which
  // would silently construct a fresh instance on every single re-render
  // since `AppShell` never passes one. Harmless today only because that
  // class holds no in-memory state of its own (every method reads/writes
  // `window.localStorage` directly) — but fragile-by-construction, and
  // exactly the kind of thing that quietly breaks the moment this or any
  // caller's store gains real in-memory state.
  const [store] = useState(
    () => storeOverride ?? new LocalStorageUpdatePreferenceStore(),
  );
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [autoCheckEnabled, setAutoCheckEnabledState] = useState(() =>
    isDesktopRuntime() ? store.getAutoCheckEnabled() : false,
  );
  const [startupPromptsEnabled, setStartupPromptsEnabledState] = useState(() =>
    isDesktopRuntime() ? store.getStartupPromptsEnabled() : false,
  );
  const handleRef = useRef<UpdateHandle | null>(null);
  const hasCheckedThisSession = useRef(false);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void getVersion().then(setCurrentVersion);
  }, []);

  const runCheck = useCallback(
    async (options: { source: UpdateSource }) => {
      const silent = options.source === "startup";
      setState({ phase: "checking" });
      const result = await checkForUpdate();
      hasCheckedThisSession.current = true;

      if (result.status === "up-to-date") {
        setState({ phase: "idle" });
        return;
      }
      if (result.status === "error") {
        setState(
          silent
            ? { phase: "idle" }
            : { phase: "error", message: result.message },
        );
        return;
      }

      // A silent (startup) check additionally respects the popup-specific
      // opt-out and "already prompted for this exact version" bookkeeping
      // — neither applies to a manual check, which always surfaces what it
      // finds (see docs/updates, v1.0.3 "Now Updating", "SHOW PATCH NOTES
      // DURING MANUAL UPDATE CHECKS").
      if (
        silent &&
        (!store.getStartupPromptsEnabled() ||
          store.getLastPromptedVersion() === result.info.version)
      ) {
        setState({ phase: "idle" });
        return;
      }

      handleRef.current = result.handle;
      setState({
        phase: "available",
        info: result.info,
        source: options.source,
        skippedReleases: [],
      });

      // Fetched separately, after the dialog is already showing — never
      // delays it, and a failure here (network, rate limit) just leaves
      // `skippedReleases` empty rather than affecting the update itself
      // (see docs/updates, v1.0.3 "Now Updating", requirement 5: "Handle
      // failed update checks or unavailable patch-note metadata
      // gracefully without blocking startup"). The version/source guard
      // in the functional update avoids clobbering a newer state — the
      // user dismissing, installing, or triggering a fresh check while
      // this was in flight — with this now-stale result.
      const { version, currentVersion: fromVersion } = result.info;
      void fetchPublishedReleases()
        .catch(() => [])
        .then((releases) => {
          const skippedReleases = selectSkippedReleases(
            releases,
            fromVersion,
            version,
          );
          if (skippedReleases.length === 0) return;
          setState((current) =>
            current.phase === "available" &&
            current.info.version === version &&
            current.source === options.source
              ? { ...current, skippedReleases }
              : current,
          );
        });
    },
    [store],
  );

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    if (
      !shouldAutoCheckForUpdate({
        autoCheckEnabled: store.getAutoCheckEnabled(),
        alreadyCheckedThisSession: hasCheckedThisSession.current,
      })
    ) {
      return;
    }
    void runCheck({ source: "startup" });
    // Deliberately runs once per mount only — `runCheck`'s own identity is
    // stable (memoized on `store`, which is stable for the app's lifetime),
    // and re-running this on every render would defeat the whole point of
    // `hasCheckedThisSession`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkNow = useCallback(
    () => runCheck({ source: "manual" }),
    [runCheck],
  );

  const setAutoCheckEnabled = useCallback(
    (enabled: boolean) => {
      store.setAutoCheckEnabled(enabled);
      setAutoCheckEnabledState(enabled);
    },
    [store],
  );

  const setStartupPromptsEnabled = useCallback(
    (enabled: boolean) => {
      store.setStartupPromptsEnabled(enabled);
      setStartupPromptsEnabledState(enabled);
    },
    [store],
  );

  const installUpdate = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;
    setState({ phase: "downloading", progress: null });
    const result = await downloadAndInstallUpdate(handle, (progress) => {
      setState({ phase: "downloading", progress });
    });
    if (result.status === "error") {
      setState({ phase: "error", message: result.message });
      return;
    }
    setState({ phase: "ready-to-restart" });
  }, []);

  const dismiss = useCallback(() => {
    setState((current) => {
      if (current.phase === "available" && current.source === "startup") {
        store.setLastPromptedVersion(current.info.version);
      }
      return { phase: "idle" };
    });
  }, [store]);

  const disableStartupPrompts = useCallback(() => {
    store.setStartupPromptsEnabled(false);
    setStartupPromptsEnabledState(false);
    setState({ phase: "idle" });
  }, [store]);

  const restartNow = useCallback(async () => {
    await relaunchApp();
  }, []);

  const restartLater = useCallback(() => setState({ phase: "idle" }), []);

  const value = useMemo<UpdateContextValue>(
    () => ({
      state,
      currentVersion,
      autoCheckEnabled,
      setAutoCheckEnabled,
      startupPromptsEnabled,
      setStartupPromptsEnabled,
      checkNow,
      installUpdate,
      dismiss,
      disableStartupPrompts,
      restartNow,
      restartLater,
    }),
    [
      state,
      currentVersion,
      autoCheckEnabled,
      setAutoCheckEnabled,
      startupPromptsEnabled,
      setStartupPromptsEnabled,
      checkNow,
      installUpdate,
      dismiss,
      disableStartupPrompts,
      restartNow,
      restartLater,
    ],
  );

  return (
    <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
  );
}

export function useUpdateContext(): UpdateContextValue {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error("useUpdateContext must be used within an UpdateProvider");
  }
  return context;
}
