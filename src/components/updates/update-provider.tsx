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
import { isDesktopRuntime } from "@/infrastructure/tauri/desktop-runtime";
import {
  LocalStorageUpdatePreferenceStore,
  type UpdatePreferenceStore,
} from "@/infrastructure/updates/update-preference-store";

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; info: UpdateInfo }
  | { phase: "downloading"; progress: InstallProgress | null }
  | { phase: "ready-to-restart" }
  | { phase: "error"; message: string };

interface UpdateContextValue {
  state: UpdateState;
  /** `null` on the web build, or before the desktop app's own version has resolved. */
  currentVersion: string | null;
  autoCheckEnabled: boolean;
  setAutoCheckEnabled: (enabled: boolean) => void;
  /** Always runs regardless of `autoCheckEnabled` or the check-frequency policy — the Settings page's "Check for Updates" button, and errors here ARE surfaced (see docs/product-spec.md, "UPDATE SETTING": "manual Check for Updates still works"). */
  checkNow: () => Promise<void>;
  installUpdate: () => Promise<void>;
  /** "Later" on the available-update dialog — hides it for the rest of this session without dismissing the update itself (a manual re-check, or the next launch, will offer it again). */
  dismiss: () => void;
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
 * Runs at most one AUTOMATIC check per app session, gated by
 * `shouldAutoCheckForUpdate` (installation-level preference + minimum
 * interval — see `update-check-policy.ts`) — never blocks startup (it's
 * fired from an effect, after first paint) and never surfaces an error to
 * the user (a failed automatic check just quietly does nothing; only a
 * manual "Check for Updates" click surfaces its own failure). Mounted once
 * at the app-shell level (like `WatchUndoProvider`) so the "available"/
 * "downloading"/"ready-to-restart" dialog can appear regardless of which
 * page is open, and survives navigation between pages without re-checking.
 */
export function UpdateProvider({
  children,
  store = new LocalStorageUpdatePreferenceStore(),
}: {
  children: ReactNode;
  store?: UpdatePreferenceStore;
}) {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [autoCheckEnabled, setAutoCheckEnabledState] = useState(() =>
    isDesktopRuntime() ? store.getAutoCheckEnabled() : false,
  );
  const handleRef = useRef<UpdateHandle | null>(null);
  const hasCheckedThisSession = useRef(false);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void getVersion().then(setCurrentVersion);
  }, []);

  const runCheck = useCallback(
    async (options: { silent: boolean }) => {
      setState({ phase: "checking" });
      const result = await checkForUpdate();
      hasCheckedThisSession.current = true;
      store.setLastCheckedAt(new Date().toISOString());

      if (result.status === "up-to-date") {
        setState({ phase: "idle" });
        return;
      }
      if (result.status === "error") {
        setState(
          options.silent
            ? { phase: "idle" }
            : { phase: "error", message: result.message },
        );
        return;
      }
      handleRef.current = result.handle;
      setState({ phase: "available", info: result.info });
    },
    [store],
  );

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    if (
      !shouldAutoCheckForUpdate({
        autoCheckEnabled: store.getAutoCheckEnabled(),
        lastCheckedAt: store.getLastCheckedAt(),
        alreadyCheckedThisSession: hasCheckedThisSession.current,
        now: new Date(),
      })
    ) {
      return;
    }
    void runCheck({ silent: true });
    // Deliberately runs once per mount only — `runCheck`'s own identity is
    // stable (memoized on `store`, which is stable for the app's lifetime),
    // and re-running this on every render would defeat the whole point of
    // `hasCheckedThisSession`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkNow = useCallback(() => runCheck({ silent: false }), [runCheck]);

  const setAutoCheckEnabled = useCallback(
    (enabled: boolean) => {
      store.setAutoCheckEnabled(enabled);
      setAutoCheckEnabledState(enabled);
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

  const dismiss = useCallback(() => setState({ phase: "idle" }), []);

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
      checkNow,
      installUpdate,
      dismiss,
      restartNow,
      restartLater,
    }),
    [
      state,
      currentVersion,
      autoCheckEnabled,
      setAutoCheckEnabled,
      checkNow,
      installUpdate,
      dismiss,
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
