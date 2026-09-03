"use client";

import { ThemeRenderer } from "@fdraft/theme-renderer";
import type { AssetResolver } from "@fdraft/theme-renderer";
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
import { FDraftThemeRenderContextProvider } from "@/infrastructure/theme-runtime/render-context";

const PREVIEW_PROFILE_ID = "theme-preview";

/**
 * Read-only, mock render context — see docs/updates, "FDRAFT THEME
 * RUNTIME — PROMPT 10": "It must use mock or read-only state, never alter
 * real profiles or dates." No repository write ever happens for these
 * values; they're static, harmless numbers so the countdown/progress/
 * points adapters have something plausible to show.
 */
function mockRenderContextValue(eventId: string) {
  return {
    eventId,
    films: [],
    pointsBalance: 123,
    progressPercent: 40,
    watchedCount: 2,
    targetCount: 5,
    countdownTargetAtMs: Date.now() + 60 * 60 * 1000,
  };
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "loaded";
      document: RuntimeThemeDocument;
      assetResolver: AssetResolver;
    }
  | { status: "error"; error: ThemeLoadError };

/**
 * A fresh, throwaway per-session database (never the user's real
 * profile) — see `mockRenderContextValue`'s own doc comment for the same
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
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const databaseName = usePreviewDatabaseName();
  const lastMtimeRef = useRef<number | null>(null);

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
    setState({ status: "loading" });
    const response = await fetch(
      `/api/theme-preview?path=${encodeURIComponent(fdthemePath)}`,
    );
    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      setState({
        status: "error",
        error: {
          code: "FETCH_FAILED",
          userMessage: "This theme could not be loaded.",
          devMessage: body.message ?? `HTTP ${response.status}`,
        },
      });
      return;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const result = await loadFdthemeArchive(bytes);
    if (!result.ok) {
      setState({ status: "error", error: result.error });
      return;
    }
    setState({
      status: "loaded",
      document: result.document,
      assetResolver: createValidatedPackageAssetResolver(
        result.document,
        result.assets,
      ),
    });
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

      {state.status === "error" ? (
        <p className="text-destructive text-sm">
          {state.error.userMessage} ({state.error.devMessage})
        </p>
      ) : null}

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
          aspectRatio:
            state.status === "loaded" && state.document.canvas
              ? `${state.document.canvas.width} / ${state.document.canvas.height}`
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
          {state.status === "loaded" &&
          state.document.pages[0] &&
          profileSeeded ? (
            <ProfileProvider databaseName={databaseName}>
              <EventDiscoveryProvider>
                <WatchUndoProvider>
                  <FDraftThemeRenderContextProvider
                    value={mockRenderContextValue(
                      state.document.manifest.themeId,
                    )}
                  >
                    <ThemeRenderer
                      document={state.document}
                      assetResolver={state.assetResolver}
                      componentAdapters={fdraftComponentAdapterRegistry}
                      copyContracts={fdraftComponentCopyContractRegistry}
                      target={{
                        kind: "page",
                        pageId: state.document.pages[0].id,
                      }}
                    />
                  </FDraftThemeRenderContextProvider>
                </WatchUndoProvider>
              </EventDiscoveryProvider>
            </ProfileProvider>
          ) : (
            <p className="text-muted-foreground p-4 text-sm">
              {state.status === "loading"
                ? "Loading…"
                : "Enter an absolute path to a .fdtheme file and click Load."}
            </p>
          )}
        </ThemeBoundary>
      </div>
    </div>
  );
}
