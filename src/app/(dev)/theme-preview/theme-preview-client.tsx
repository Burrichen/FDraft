"use client";

import { ThemeRenderer } from "@fdraft/theme-renderer";
import type {
  AssetResolver,
  HostSettings,
  RenderState,
  ThemeRenderTarget,
} from "@fdraft/theme-renderer";
import type { RuntimeThemeDocument } from "@fdraft/theme-sdk";
import { useEffect, useRef, useState } from "react";
import {
  fdraftComponentAdapterRegistry,
  fdraftComponentCopyContractRegistry,
} from "@/components/events/theme-runtime/component-adapters";
import { ThemeBoundary } from "@/components/events/theme-runtime/theme-boundary";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import {
  createValidatedPackageAssetResolver,
  loadFdthemeArchive,
  type ThemeLoadError,
} from "@/infrastructure/theme-runtime/theme-loader";
import {
  FDraftThemeRenderContextProvider,
  type FDraftThemeRenderContextValue,
} from "@/infrastructure/theme-runtime/render-context";

const PREVIEW_PROFILE_ID = "theme-preview";

/**
 * Read-only, adjustable simulator state — see docs/updates, "FDRAFT THEME
 * RUNTIME — PROMPT 10": "It must use mock or read-only state, never alter
 * real profiles or dates." Nothing here ever performs a repository write;
 * every value is a plain in-memory number/boolean a developer can move to
 * exercise Behaviour Mode boundaries, `event-progress`/`draft-progress`,
 * and the effects performance tiers — mirroring Studio's own Simulate
 * mode, never a real per-event participation lookup (this route has no
 * reliable way to map an arbitrary previewed `.fdtheme`'s themeId to a
 * real `EventDefinition`).
 */
interface SimulatorEventState {
  eventAvailable: boolean;
  eventActive: boolean;
  optedIn: boolean;
  draftGenerated: boolean;
  eventCompleted: boolean;
  eventPhase: "" | "available" | "active" | "ended";
  progressPercent: number;
  watchedCount: number;
  targetCount: number;
  pointsBalance: number;
  lifetimePointsBalance: number;
  performanceTier: HostSettings["performanceTier"];
  /** `null` = follow the real OS `prefers-reduced-motion` signal (FDraft's own established convention — see `settings-view.tsx`'s own doc comment: "every actual reduced-motion behaviour is driven directly by the OS-level media query"). */
  reducedMotionOverride: boolean | null;
}

const DEFAULT_SIMULATOR_STATE: SimulatorEventState = {
  eventAvailable: true,
  eventActive: true,
  optedIn: true,
  draftGenerated: true,
  eventCompleted: false,
  eventPhase: "active",
  progressPercent: 40,
  watchedCount: 2,
  targetCount: 5,
  pointsBalance: 123,
  lifetimePointsBalance: 456,
  performanceTier: "high",
  reducedMotionOverride: null,
};

/** The real, standard OS-level signal — same convention every other reduced-motion behaviour in FDraft already uses (see `SimulatorEventState.reducedMotionOverride`'s own doc comment). */
function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function buildMockRenderContext(
  eventId: string,
  sim: SimulatorEventState,
): FDraftThemeRenderContextValue {
  return {
    eventId,
    films: [],
    pointsBalance: sim.pointsBalance,
    lifetimePointsBalance: sim.lifetimePointsBalance,
    progressPercent: sim.progressPercent,
    watchedCount: sim.watchedCount,
    targetCount: sim.targetCount,
    countdownTargetAtMs: Date.now() + 60 * 60 * 1000,
    eventAvailable: sim.eventAvailable,
    eventActive: sim.eventActive,
    optedIn: sim.optedIn,
    draftGenerated: sim.draftGenerated,
    eventCompleted: sim.eventCompleted,
    eventPhase: sim.eventPhase === "" ? undefined : sim.eventPhase,
  };
}

function buildRenderState(sim: SimulatorEventState): RenderState {
  return {
    activeImageStates: {},
    eventPhase: sim.eventPhase === "" ? undefined : sim.eventPhase,
    event: {
      eventActive: sim.eventActive,
      eventAvailable: sim.eventAvailable,
      optedIn: sim.optedIn,
      draftGenerated: sim.draftGenerated,
      progressPercent: sim.progressPercent,
      watchedCount: sim.watchedCount,
      targetCount: sim.targetCount,
      eventCompleted: sim.eventCompleted,
    },
  };
}

interface LoadedTheme {
  document: RuntimeThemeDocument;
  assetResolver: AssetResolver;
}

/**
 * A fresh, throwaway per-session database (never the user's real
 * profile) — see `buildMockRenderContext`'s own doc comment for the same
 * "mock or read-only state" requirement. Created once per page load,
 * discarded on navigation away; nothing here is persisted across visits.
 */
function usePreviewDatabaseName(): string {
  const [databaseName] = useState(() => `theme-preview-${crypto.randomUUID()}`);
  return databaseName;
}

export function ThemePreviewClient() {
  const [path, setPath] = useState("");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    "idle",
  );
  /**
   * Kept SEPARATE from `error` on purpose — see docs/architecture/
   * INTEGRATION_WORKFLOW.md: "The last valid preview remains active when
   * the current edit is invalid." A failed reload (e.g. a theme author
   * saved a momentarily-broken edit) sets `error` without clearing
   * `loaded`, so the themed content on screen keeps showing the last
   * successfully loaded version underneath the error banner instead of
   * blanking out.
   */
  const [loaded, setLoaded] = useState<LoadedTheme | null>(null);
  const [error, setError] = useState<ThemeLoadError | null>(null);
  /** `null` means "no manual selection yet for the current `loaded` document" — reset at the same place `loaded` itself is set (see `loadFrom`), never via a separate effect watching `loaded` change. The effective target derives the first real page as a fallback below. */
  const [manualTarget, setManualTarget] = useState<ThemeRenderTarget | null>(
    null,
  );
  const [sim, setSim] = useState<SimulatorEventState>(DEFAULT_SIMULATOR_STATE);
  const databaseName = usePreviewDatabaseName();
  const lastMtimeRef = useRef<number | null>(null);
  const systemReducedMotion = useSystemReducedMotion();

  const [profileSeeded, setProfileSeeded] = useState(false);

  useEffect(() => {
    // React Strict Mode's dev-only mount -> cleanup -> remount cycle
    // means this effect's cleanup can run while `profiles.create` is
    // still in flight. Closing `db` synchronously in that cleanup (an
    // earlier version of this effect did) raced Dexie's own in-flight
    // transaction and produced a genuine `DatabaseClosedError` — caught
    // by this preview's own verification, and NOT just a cosmetic
    // console line: Dexie logs it as an internal trace regardless of
    // whether the rejection itself is caught downstream, so catching the
    // rejection alone doesn't stop it appearing in the console. The only
    // real fix is to never close the database while the write is still
    // outstanding — the cleanup here defers closing until the seed
    // attempt has fully settled (success or failure) either way.
    let cancelled = false;
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);

    const seedPromise = repos.profiles
      .create({
        id: PREVIEW_PROFILE_ID,
        displayName: "Theme Preview",
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
        timezone: "UTC",
        settings: {
          reducedMotion: false,
          defaultPage: "watchlist",
          franchiseChronologicalOrder: false,
          adminMode: false,
          halloweenPumpkinState: "uncarved",
        },
        dataVersion: 1,
      })
      .catch((cause: unknown) => {
        // React Strict Mode's double-invoke calls `create` twice with
        // the SAME fixed id against the SAME database (`databaseName`
        // is stable across the synthetic remount) — the second call's
        // `ConstraintError: Key already exists` is benign and expected
        // (the profile the first call already committed is exactly what
        // this effect wants to exist), not a real failure. Only an
        // unexpected error is worth logging.
        if (cause instanceof Error && cause.name === "ConstraintError") return;
        console.error("[theme preview] failed to seed preview profile:", cause);
      })
      .finally(() => {
        if (!cancelled) setProfileSeeded(true);
      });

    return () => {
      cancelled = true;
      void seedPromise.finally(() => void db.close());
    };
  }, [databaseName]);

  async function loadFrom(fdthemePath: string) {
    setStatus("loading");
    const response = await fetch(
      `/api/theme-preview?path=${encodeURIComponent(fdthemePath)}`,
    );
    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      setError({
        code: "FETCH_FAILED",
        userMessage: "This theme could not be loaded.",
        devMessage: body.message ?? `HTTP ${response.status}`,
      });
      setStatus("error");
      return;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const result = await loadFdthemeArchive(bytes);
    if (!result.ok) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setLoaded({
      document: result.document,
      assetResolver: createValidatedPackageAssetResolver(
        result.document,
        result.assets,
      ),
    });
    setError(null);
    setStatus("loaded");
    // A new document may not even have the previously-selected page/popup
    // id — clear the manual selection here, at the point the document
    // itself changes, rather than in a separate effect reacting to it.
    setManualTarget(null);
  }

  useEffect(() => {
    if (!activePath) return;
    const pathToLoad = activePath;
    async function run() {
      await loadFrom(pathToLoad);
    }
    void run();
  }, [activePath]);

  // The local-only reload protocol (see `theme-preview-server.ts`): poll
  // the watch route every second, reload the moment mtime changes.
  useEffect(() => {
    if (!activePath) return;
    const interval = setInterval(async () => {
      const response = await fetch(
        `/api/theme-preview/watch?path=${encodeURIComponent(activePath)}`,
      );
      if (!response.ok) return;
      const body = (await response.json()) as { mtimeMs?: number };
      if (typeof body.mtimeMs !== "number") return;
      if (
        lastMtimeRef.current !== null &&
        body.mtimeMs !== lastMtimeRef.current
      ) {
        void loadFrom(activePath);
      }
      lastMtimeRef.current = body.mtimeMs;
    }, 1000);
    return () => clearInterval(interval);
  }, [activePath]);

  // The effective target: whatever was manually picked, else the first
  // real page — computed directly during render (no effect needed) so a
  // freshly loaded document with no manual selection yet still has
  // something sensible to render immediately.
  const firstPage = loaded?.document.pages[0];
  const target: ThemeRenderTarget | null =
    manualTarget ?? (firstPage ? { kind: "page", pageId: firstPage.id } : null);

  const hostSettings: HostSettings = {
    performanceTier: sim.performanceTier,
    reducedMotion: sim.reducedMotionOverride ?? systemReducedMotion,
  };
  const renderState = buildRenderState(sim);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="page-heading text-xl">Theme Preview (development only)</h1>
      <div className="flex gap-2">
        <input
          className="border-border bg-background flex-1 rounded border px-2 py-1 text-sm"
          placeholder="/absolute/path/to/theme.fdtheme"
          value={path}
          onChange={(event) => setPath(event.target.value)}
        />
        <button
          type="button"
          className="bg-primary text-primary-foreground rounded px-3 py-1 text-sm"
          onClick={() => setActivePath(path)}
        >
          Load
        </button>
      </div>

      {error ? (
        <p className="text-destructive text-sm">
          {error.userMessage} ({error.devMessage})
          {loaded
            ? " — showing the last successfully loaded version below."
            : ""}
        </p>
      ) : null}

      {loaded &&
      (loaded.document.pages.length > 1 ||
        loaded.document.popups.length > 0) ? (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Page/popup:</span>
          <select
            className="border-border bg-background rounded border px-2 py-1 text-sm"
            value={
              target
                ? `${target.kind}:${target.kind === "page" ? target.pageId : target.popupId}`
                : ""
            }
            onChange={(event) => {
              const [kind, id] = event.target.value.split(":");
              if (kind === "page")
                setManualTarget({ kind: "page", pageId: id ?? "" });
              else if (kind === "popup")
                setManualTarget({ kind: "popup", popupId: id ?? "" });
            }}
          >
            {loaded.document.pages.map((page) => (
              <option key={page.id} value={`page:${page.id}`}>
                Page — {page.name}
              </option>
            ))}
            {loaded.document.popups.map((popup) => (
              <option key={popup.id} value={`popup:${popup.id}`}>
                Popup — {popup.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <details className="border-border rounded border p-3 text-sm">
        <summary className="text-muted-foreground cursor-pointer">
          Simulator (Behaviour Mode &amp; effects) — read-only, never a real
          profile
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sim.eventAvailable}
              onChange={(e) =>
                setSim({ ...sim, eventAvailable: e.target.checked })
              }
            />
            Event available
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sim.eventActive}
              onChange={(e) =>
                setSim({ ...sim, eventActive: e.target.checked })
              }
            />
            Event active
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sim.optedIn}
              onChange={(e) => setSim({ ...sim, optedIn: e.target.checked })}
            />
            Opted in
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sim.draftGenerated}
              onChange={(e) =>
                setSim({ ...sim, draftGenerated: e.target.checked })
              }
            />
            Draft generated
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sim.eventCompleted}
              onChange={(e) =>
                setSim({ ...sim, eventCompleted: e.target.checked })
              }
            />
            Event completed
          </label>
          <label className="flex items-center gap-2">
            <span>Phase</span>
            <select
              className="border-border bg-background rounded border px-1 py-0.5"
              value={sim.eventPhase}
              onChange={(e) =>
                setSim({
                  ...sim,
                  eventPhase: e.target
                    .value as SimulatorEventState["eventPhase"],
                })
              }
            >
              <option value="">(none)</option>
              <option value="available">available</option>
              <option value="active">active</option>
              <option value="ended">ended</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span>Progress %</span>
            <input
              type="number"
              min={0}
              max={100}
              className="border-border bg-background w-16 rounded border px-1 py-0.5"
              value={sim.progressPercent}
              onChange={(e) =>
                setSim({ ...sim, progressPercent: Number(e.target.value) })
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <span>Watched/Target</span>
            <input
              type="number"
              min={0}
              className="border-border bg-background w-14 rounded border px-1 py-0.5"
              value={sim.watchedCount}
              onChange={(e) =>
                setSim({ ...sim, watchedCount: Number(e.target.value) })
              }
            />
            /
            <input
              type="number"
              min={0}
              className="border-border bg-background w-14 rounded border px-1 py-0.5"
              value={sim.targetCount}
              onChange={(e) =>
                setSim({ ...sim, targetCount: Number(e.target.value) })
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <span>Performance tier</span>
            <select
              className="border-border bg-background rounded border px-1 py-0.5"
              value={sim.performanceTier}
              onChange={(e) =>
                setSim({
                  ...sim,
                  performanceTier: e.target
                    .value as HostSettings["performanceTier"],
                })
              }
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span>Reduced motion</span>
            <select
              className="border-border bg-background rounded border px-1 py-0.5"
              value={
                sim.reducedMotionOverride === null
                  ? "system"
                  : sim.reducedMotionOverride
                    ? "on"
                    : "off"
              }
              onChange={(e) =>
                setSim({
                  ...sim,
                  reducedMotionOverride:
                    e.target.value === "system"
                      ? null
                      : e.target.value === "on",
                })
              }
            >
              <option value="system">
                system ({systemReducedMotion ? "on" : "off"})
              </option>
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </label>
        </div>
      </details>

      <div
        className="border-border relative w-full overflow-hidden rounded border"
        style={{
          // The renderer positions every layer as a PERCENTAGE of the
          // theme's own declared canvas size — squeezing that into a
          // container with a different aspect ratio (this box previously
          // had a fixed height regardless of width) skews every
          // percentage-based box, which is what made this fixture's
          // title text render far narrower than authored and get
          // clipped by its own `truncate` class, found during
          // verification. Matching the real canvas aspect ratio (default
          // 16:9 for a theme with no declared `canvas`, mirroring
          // `@fdraft/theme-renderer`'s own same default) keeps every
          // layer's proportions faithful regardless of container width.
          aspectRatio: loaded?.document.canvas
            ? `${loaded.document.canvas.width} / ${loaded.document.canvas.height}`
            : "16 / 9",
        }}
      >
        <ThemeBoundary
          fallback={
            <p className="p-4 text-sm">
              The theme failed to render. Normal FDraft is unaffected.
            </p>
          }
        >
          {loaded && target && profileSeeded ? (
            <ProfileProvider databaseName={databaseName}>
              <EventDiscoveryProvider>
                <WatchUndoProvider>
                  <FDraftThemeRenderContextProvider
                    value={buildMockRenderContext(
                      loaded.document.manifest.themeId,
                      sim,
                    )}
                  >
                    <ThemeRenderer
                      document={loaded.document}
                      assetResolver={loaded.assetResolver}
                      componentAdapters={fdraftComponentAdapterRegistry}
                      copyContracts={fdraftComponentCopyContractRegistry}
                      target={target}
                      hostSettings={hostSettings}
                      renderState={renderState}
                    />
                  </FDraftThemeRenderContextProvider>
                </WatchUndoProvider>
              </EventDiscoveryProvider>
            </ProfileProvider>
          ) : (
            <p className="text-muted-foreground p-4 text-sm">
              {status === "loading"
                ? "Loading…"
                : "Enter an absolute path to a .fdtheme file and click Load."}
            </p>
          )}
        </ThemeBoundary>
      </div>
    </div>
  );
}
