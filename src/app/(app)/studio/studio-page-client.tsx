"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Crop,
  ImagePlus,
  Lock,
  LockOpen,
  Maximize2,
  Minimize2,
  Monitor,
  Pin,
  PinOff,
  Redo2,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import {
  clearEventArtWorkspacePath,
  getEventArtWorkspacePath,
  setEventArtWorkspacePath,
} from "@/application/event-studio/workspace-store";
import {
  getStudioSave,
  setStudioSave,
} from "@/application/event-studio/studio-working-theme-store";
import {
  clearStudioAutosave,
  getStudioAutosave,
} from "@/application/event-studio/studio-autosave-store";
import {
  addStudioRevision,
  createRevisionLabel,
} from "@/application/event-studio/studio-revisions-store";
import { loadCanonicalEventTheme } from "@/application/event-themes/load-canonical-event-theme";
import { StudioFilePanel } from "@/components/events/theme-editor/studio-file-panel";
import {
  getEventStudioPresets,
  DEFAULT_EVENT_STUDIO_PRESET_ID,
} from "@/components/events/event-studio-presets";
import { AssetBrowserPanel } from "@/components/events/theme-editor/asset-browser-panel";
import { ImportAssetDialog } from "@/components/events/theme-editor/import-asset-dialog";
import {
  EditableThemeCanvas,
  type PlacementUpdater,
} from "@/components/events/theme-editor/editable-theme-canvas";
import { InspectorPanel } from "@/components/events/theme-editor/inspector-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import type {
  AlignAction,
  DistributeAction,
} from "@/domain/event-studio/alignment-ops";
import {
  computeAlignedOffsets,
  computeDistributedOffsets,
  type AlignableBox,
} from "@/domain/event-studio/alignment-ops";
import {
  breakpointCopyWouldOverwriteEdits,
  copyBreakpointLayout,
} from "@/domain/event-themes/fdraft-theme-breakpoint-copy";
import type {
  FDraftThemeBreakpointId,
  FDraftThemeFile,
  FDraftThemePlacement,
  FDraftThemeWeightedVariant,
} from "@/domain/event-themes/fdraft-theme-schema";
import {
  DEFAULT_STUDIO_BREAKPOINT_ID,
  STUDIO_BREAKPOINTS,
  STUDIO_PAGES,
  getStudioBreakpoint,
  getStudioPage,
  isModalStudioPage,
  type StudioPageId,
} from "@/domain/event-studio/studio-pages";
import {
  addPlacement,
  createFixedPlacement,
  duplicatePlacement,
  ensureAssetRegistered,
  generateUniquePlacementId,
  getPlacementsAt,
  removePlacement,
  reorderPlacement,
  updatePlacement,
  type PlacementLocation,
} from "@/domain/event-studio/placement-ops";
import {
  DEFAULT_PLACEMENT_WIDTH_REM,
  DUPLICATE_OFFSET_REM,
  pxToRem,
  resolvePlacementBoxPx,
} from "@/domain/event-studio/placement-geometry";
import {
  groupPlacements,
  pruneMissingFromGroups,
  ungroupPlacements,
  type PlacementGroups,
} from "@/domain/event-studio/placement-groups";
import {
  copyPlacementsToBreakpoint,
  otherBreakpoints,
  placementCopyWouldOverwriteExisting,
} from "@/domain/event-studio/placement-breakpoint-copy";
import { findSafeZoneOverlapWarnings } from "@/domain/event-studio/safe-zone-check";
import {
  friendlyAssetName,
  WORKSPACE_ASSET_COMMON_EVENT_ID,
  type WorkspaceAssetEntry,
} from "@/domain/event-studio/workspace-asset";
import {
  findAssetReferences,
  formatAssetReference,
  type AssetReference,
} from "@/domain/event-studio/theme-asset-references";
import {
  addVariantOption,
  convertToVariantGroup,
  createVariantOption,
  removeVariantOption,
  reorderVariantOption,
  updateVariantOption,
} from "@/domain/event-studio/variant-group-ops";
import {
  copyEventArtAsset,
  deleteEventArtAsset,
  getDevProjectRoot,
  openEventArtWorkspaceFolder,
  pickEventArtWorkspaceFolder,
  pickImportSourceFile,
  validateEventArtWorkspaceFolder,
} from "@/infrastructure/tauri/event-art-workspace";
import { isDesktopRuntime } from "@/infrastructure/tauri/desktop-runtime";
import { isEventStudioBuild } from "@/lib/event-studio-build";
import { useAsyncData } from "@/hooks/use-async-data";
import { useUndoableTheme } from "@/hooks/use-undoable-theme";
import {
  isEditableTarget,
  useThemeEditorShortcuts,
} from "@/hooks/use-theme-editor-shortcuts";
import { useStudioAutosave } from "@/hooks/use-studio-autosave";
import { toggleWindowFullscreen } from "@/infrastructure/tauri/window-fullscreen";

/** The Reroll Preview's own "at rest" baseline (see docs/updates, "EVENT STUDIO — PHASE 5" §4) — "Reset Preview Seed" returns to exactly this, never a freshly-random one, so resetting is a real, predictable action rather than just another reroll. */
const DEFAULT_PREVIEW_SEED = "event-studio-preview-seed";

function placementWidthHeightRem(placement: FDraftThemePlacement): {
  width: number;
  height: number;
} {
  const width = placement.width ?? DEFAULT_PLACEMENT_WIDTH_REM;
  const height =
    placement.height ??
    (placement.width !== null && placement.aspectRatio !== null
      ? placement.width / placement.aspectRatio
      : width);
  return { width, height };
}

/**
 * FDraft (Dev)'s Event Studio editor workspace (see docs/updates, "EVENT
 * STUDIO — PHASE 3" for the shell, "EVENT STUDIO — PHASE 4" for the core
 * visual editor, "EVENT STUDIO — PHASE 5" for weighted variants, ordinary
 * visual groups, multiselect, alignment/distribution, snapping, the
 * editor-only grid, responsive-visibility summary, per-placement
 * breakpoint copy, and safe-area warnings). Stops before the final save/
 * export pipeline (§13) — every edit already round-trips through the
 * SAME Load/Save/Reset working-theme mechanism Phase 3 built.
 */
export function StudioPageClient() {
  const { activeProfile, repositories } = useProfileContext();
  const profileId = activeProfile?.id ?? null;

  const [presetId, setPresetId] = useState(DEFAULT_EVENT_STUDIO_PRESET_ID);
  const [pageId, setPageId] = useState<StudioPageId>("watchlist");
  const [stateId, setStateId] = useState<string>(
    STUDIO_PAGES.find((page) => page.id === "watchlist")!.states[0].id,
  );
  const [breakpointId, setBreakpointId] = useState<FDraftThemeBreakpointId>(
    DEFAULT_STUDIO_BREAKPOINT_ID,
  );
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [showSafeZones, setShowSafeZones] = useState(false);

  const [previewDbName] = useState(
    () => `studio-preview-${crypto.randomUUID()}`,
  );

  const undoableTheme = useUndoableTheme();
  const theme = undoableTheme.theme;
  const [themeSource, setThemeSource] = useState<
    "canonical" | "working" | "none"
  >("none");
  const [themeLoading, setThemeLoading] = useState(false);
  const lastPersistedThemeRef = useRef<typeof theme>(null);
  const hasUnsavedChanges = theme !== lastPersistedThemeRef.current;
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [filePanelOpen, setFilePanelOpen] = useState(false);
  const [recoverableAutosave, setRecoverableAutosave] = useState<{
    theme: FDraftThemeFile;
    savedAt: string;
  } | null>(null);

  // Editor-only state (never persisted into the `.fdraft-theme` itself —
  // see `editable-theme-canvas.tsx`'s own doc comment on locking/groups)
  // — reset whenever the page/state/breakpoint/preset selection changes,
  // since a placement id's lock/selection/group is only meaningful
  // within the view it was set in.
  const [selectedPlacementIds, setSelectedPlacementIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [lockedPlacementIds, setLockedPlacementIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [groups, setGroups] = useState<PlacementGroups>([]);
  const [freeResize, setFreeResize] = useState(false);
  const [cropPlacementId, setCropPlacementId] = useState<string | null>(null);
  const [interactionTestMode, setInteractionTestMode] = useState(false);
  const [previewSeed, setPreviewSeed] = useState(DEFAULT_PREVIEW_SEED);
  const [variantPickingPlacementId, setVariantPickingPlacementId] = useState<
    string | null
  >(null);
  const clipboardRef = useRef<FDraftThemePlacement[]>([]);

  // Editor display zoom (see docs/updates, "EVENT STUDIO — PHASE 7" §5/§6)
  // — a CSS `transform: scale()` applied only to the on-screen canvas.
  // Placement geometry (`offsetX`/`offsetY`/`width`/`height` in rem) is
  // never touched by this — exported layout coordinates are identical
  // whether the editor happens to be zoomed in, zoomed out, or fit to a
  // small monitor.
  const [zoomSetting, setZoomSetting] = useState<"fit" | number>("fit");
  const [previewAreaEl, setPreviewAreaEl] = useState<HTMLDivElement | null>(
    null,
  );
  const [previewAreaSize, setPreviewAreaSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!previewAreaEl) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPreviewAreaSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(previewAreaEl);
    return () => observer.disconnect();
  }, [previewAreaEl]);

  const [snapToGrid, setSnapToGrid] = useState(false);
  const [snapToPage, setSnapToPage] = useState(true);
  const [snapToCenter, setSnapToCenter] = useState(true);
  const [snapToObjects, setSnapToObjects] = useState(false);
  const [gridSizePx, setGridSizePx] = useState(20);
  const [showGrid, setShowGrid] = useState(false);

  // Fullscreen Edit (see docs/updates, "EVENT STUDIO — PHASE 8" §3/§4) —
  // collapses the toolbar/Asset panel/Inspector panel so the canvas gets
  // essentially the whole window; each panel is still reachable as a
  // temporary floating drawer (`openDrawer`) that OVERLAYS the canvas
  // (fixed-position, never part of the flex layout — see §5) rather than
  // resizing it. Entirely orthogonal to `mode` ("edit"/"preview") — the
  // canvas's own editing overlay (selection handles, safe zones, grid,
  // crop, snapping) keeps working identically in Fullscreen Edit; only
  // Preview Mode is fully chrome-free (see §13).
  const [fullscreenEdit, setFullscreenEdit] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<
    "assets" | "inspector" | "toolbar" | null
  >(null);
  // Assets auto-closes after placing one (§6) unless pinned open.
  const [assetsPanelPinned, setAssetsPanelPinned] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a locked/selected/grouped/cropping placement id is only meaningful within the view it was set in, same accepted "reset on context change" pattern as `useAsyncData`.
    setSelectedPlacementIds(new Set());
    setLockedPlacementIds(new Set());
    setGroups([]);
    setCropPlacementId(null);
    setVariantPickingPlacementId(null);
  }, [pageId, stateId, breakpointId, presetId]);

  const [confirmCopy, setConfirmCopy] = useState<{
    from: FDraftThemeBreakpointId;
    to: FDraftThemeBreakpointId;
  } | null>(null);
  const [confirmPlacementCopy, setConfirmPlacementCopy] = useState<{
    ids: string[];
    targets: FDraftThemeBreakpointId[];
  } | null>(null);

  const [isPickingWorkspace, setIsPickingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Import / Replace / Delete asset state (see docs/updates, "EVENT
  // STUDIO — PHASE 9" §3/§6/§14/§16).
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importSourcePath, setImportSourcePath] = useState<string | null>(null);
  const [assetRefreshToken, setAssetRefreshToken] = useState(0);
  const [pendingReplace, setPendingReplace] = useState<{
    asset: WorkspaceAssetEntry;
    sourcePath: string;
  } | null>(null);
  const [pendingDeleteAsset, setPendingDeleteAsset] =
    useState<WorkspaceAssetEntry | null>(null);
  const [deleteReferences, setDeleteReferences] = useState<AssetReference[]>(
    [],
  );
  const [assetActionError, setAssetActionError] = useState<string | null>(null);
  /** A small session-derived "what changed" summary (§16) — NOT real Git status parsing, just counting Studio's own operations this session. */
  const [projectChanges, setProjectChanges] = useState({
    imported: 0,
    replaced: 0,
    deleted: 0,
  });

  const { data: workspacePath, reloadSilently: reloadWorkspacePath } =
    useAsyncData(async () => {
      if (!profileId) return null;
      return getEventArtWorkspacePath(repositories, profileId);
    }, [profileId, repositories]);

  // Dev-from-source project-root auto-detection (see docs/updates,
  // "EVENT STUDIO — PHASE 9" §12: "do not make me reselect the
  // repository every single dev launch") — only fires once nothing is
  // already connected (never overrides an intentional prior choice,
  // including a deliberate Disconnect), and `getDevProjectRoot` itself
  // only ever resolves to a real path for a genuine `cargo tauri dev`/
  // `pnpm run studio:dev` launch — always `null` in a packaged build,
  // which instead just keeps using whatever was already persisted.
  useEffect(() => {
    if (!profileId || workspacePath !== null) return;
    let cancelled = false;
    void getDevProjectRoot().then(async (detected) => {
      if (cancelled || !detected) return;
      const validation = await validateEventArtWorkspaceFolder(detected);
      if (cancelled || !validation.valid) return;
      await setEventArtWorkspacePath(repositories, profileId, detected);
      if (!cancelled) await reloadWorkspacePath();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reloadWorkspacePath`/`repositories` are fresh per render by design; re-running this whenever `workspacePath` itself changes (e.g. right after this same effect connects it) is exactly what "only fires while nothing is connected" already guards against via the `!== null` check above.
  }, [profileId, workspacePath]);

  const presets = useMemo(() => getEventStudioPresets(), []);
  const pages = useMemo(
    () =>
      STUDIO_PAGES.filter(
        (page) =>
          !page.requiresEventPreset ||
          presetId !== DEFAULT_EVENT_STUDIO_PRESET_ID,
      ),
    [presetId],
  );
  const currentPage = getStudioPage(pageId) ?? pages[0];

  useEffect(() => {
    if (!pages.some((page) => page.id === pageId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- correcting a now-invalid selection, same accepted pattern as `useAsyncData`'s own reset.
      setPageId("watchlist");
      setStateId(
        STUDIO_PAGES.find((page) => page.id === "watchlist")!.states[0].id,
      );
    }
  }, [pages, pageId]);

  const loadTheme = useCallback(
    async (targetPresetId: string) => {
      setThemeLoading(true);
      try {
        const save = profileId
          ? await getStudioSave(repositories, profileId, targetPresetId)
          : null;
        if (save) {
          undoableTheme.reset(save.theme);
          lastPersistedThemeRef.current = save.theme;
          setThemeSource("working");
          setLastSavedAt(save.savedAt);
        } else {
          const result = await loadCanonicalEventTheme(targetPresetId);
          if (result.ok) {
            undoableTheme.reset(result.theme);
            lastPersistedThemeRef.current = result.theme;
            setThemeSource("canonical");
          } else {
            undoableTheme.reset(null);
            lastPersistedThemeRef.current = null;
            setThemeSource("none");
          }
          setLastSavedAt(null);
        }

        // Crash/restart recovery (see docs/updates, "EVENT STUDIO — PHASE
        // 6" §1) — an autosave newer than the deliberately-saved baseline
        // means the app quit/crashed with unsaved edits still pending; the
        // banner below lets the user choose to bring them back rather than
        // silently losing or silently restoring them.
        const autosave = profileId
          ? await getStudioAutosave(repositories, profileId, targetPresetId)
          : null;
        if (
          autosave &&
          (!save || new Date(autosave.savedAt) > new Date(save.savedAt))
        ) {
          setRecoverableAutosave(autosave);
        } else {
          setRecoverableAutosave(null);
        }
      } finally {
        setThemeLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `undoableTheme` is a fresh object every render by design (see `useUndoableTheme`); including it would re-trigger this load on every commit.
    [profileId, repositories],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- `loadTheme` sets `themeLoading` synchronously before its first await, same accepted pattern as `useAsyncData`.
    void loadTheme(presetId);
  }, [presetId, loadTheme]);

  useStudioAutosave({
    repositories,
    profileId,
    presetId,
    theme,
    dirty: hasUnsavedChanges,
    enabled: mode === "edit" && !themeLoading,
  });

  async function handleSave() {
    if (!profileId || !theme) return;
    const savedAt = new Date().toISOString();
    // Sequential, not `Promise.all` — these three writes all touch the
    // same underlying settings store (different keys, but overlapping
    // IndexedDB transactions against one object store), which genuinely
    // deadlocks under fake-indexeddb when run concurrently. Kept
    // sequential deliberately.
    console.error("DEBUG handleSave: start", Date.now());
    await setStudioSave(repositories, profileId, presetId, theme, savedAt);
    console.error("DEBUG handleSave: after setStudioSave", Date.now());
    await addStudioRevision(
      repositories,
      profileId,
      presetId,
      theme,
      createRevisionLabel(new Date(savedAt)),
      savedAt,
    );
    console.error("DEBUG handleSave: after addStudioRevision", Date.now());
    await clearStudioAutosave(repositories, profileId, presetId);
    console.error("DEBUG handleSave: after clearStudioAutosave", Date.now());
    setThemeSource("working");
    setLastSavedAt(savedAt);
    lastPersistedThemeRef.current = theme;
    setRecoverableAutosave(null);
    console.error("DEBUG handleSave: state setters called", Date.now());
  }

  function requestLoad() {
    if (hasUnsavedChanges) {
      setConfirmLoad(true);
      return;
    }
    void loadTheme(presetId);
  }

  function handleRestoreAutosave() {
    if (!recoverableAutosave) return;
    undoableTheme.reset(recoverableAutosave.theme);
    setRecoverableAutosave(null);
  }

  async function handleDiscardAutosave() {
    if (profileId) {
      await clearStudioAutosave(repositories, profileId, presetId);
    }
    setRecoverableAutosave(null);
  }

  function requestCopyBreakpoint(
    from: FDraftThemeBreakpointId,
    to: FDraftThemeBreakpointId,
  ) {
    if (!theme) return;
    if (breakpointCopyWouldOverwriteEdits(theme, pageId, stateId, from, to)) {
      setConfirmCopy({ from, to });
      return;
    }
    applyCopyBreakpoint(from, to);
  }

  function applyCopyBreakpoint(
    from: FDraftThemeBreakpointId,
    to: FDraftThemeBreakpointId,
  ) {
    if (!theme) return;
    undoableTheme.commit(
      copyBreakpointLayout(theme, pageId, stateId, from, to),
    );
    setConfirmCopy(null);
  }

  const location: PlacementLocation = useMemo(
    () => ({ pageId, stateId, breakpointId }),
    [pageId, stateId, breakpointId],
  );
  const breakpoint = getStudioBreakpoint(breakpointId);
  const fitZoom = previewAreaSize
    ? Math.max(
        0.1,
        Math.min(
          1,
          previewAreaSize.width / breakpoint.width,
          previewAreaSize.height / breakpoint.height,
        ),
      )
    : 1;
  const effectiveZoom = zoomSetting === "fit" ? fitZoom : zoomSetting;

  const handleCommitPlacement = useCallback(
    (placementId: string, updater: PlacementUpdater) => {
      if (!theme) return;
      undoableTheme.commit(
        updatePlacement(theme, location, placementId, updater),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `undoableTheme`/`location` are fresh objects every render by design.
    [theme, pageId, stateId, breakpointId],
  );

  const handleCommitMultiple = useCallback(
    (updates: Record<string, PlacementUpdater>) => {
      if (!theme) return;
      let next = theme;
      for (const [id, updater] of Object.entries(updates)) {
        next = updatePlacement(next, location, id, updater);
      }
      undoableTheme.commit(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, pageId, stateId, breakpointId],
  );

  function handleDeletePlacements(ids: string[]) {
    if (!theme || ids.length === 0) return;
    let next = theme;
    for (const id of ids) {
      next = removePlacement(next, location, id);
    }
    undoableTheme.commit(next);
    setSelectedPlacementIds(new Set());
    setCropPlacementId((current) =>
      ids.includes(current ?? "") ? null : current,
    );
    setGroups((current) =>
      pruneMissingFromGroups(
        current,
        new Set(getPlacementsAt(next, location).map((p) => p.id)),
      ),
    );
  }

  function handleDuplicatePlacements(ids: string[]) {
    if (!theme || ids.length === 0) return;
    let next = theme;
    const newIds: string[] = [];
    for (const id of ids) {
      const existingIds = getPlacementsAt(next, location).map((p) => p.id);
      const newId = generateUniquePlacementId(existingIds, `${id}-copy`);
      const result = duplicatePlacement(
        next,
        location,
        id,
        newId,
        DUPLICATE_OFFSET_REM,
      );
      if (!result) continue;
      next = result.theme;
      newIds.push(result.newPlacementId);
    }
    undoableTheme.commit(next);
    setSelectedPlacementIds(new Set(newIds));
  }

  function handleCopyPlacements(ids: string[]) {
    if (!theme) return;
    const found = getPlacementsAt(theme, location).filter((p) =>
      ids.includes(p.id),
    );
    if (found.length > 0) clipboardRef.current = found;
  }

  function handlePastePlacements() {
    if (!theme || clipboardRef.current.length === 0) return;
    let next = theme;
    const newIds: string[] = [];
    for (const source of clipboardRef.current) {
      const existingIds = getPlacementsAt(next, location).map((p) => p.id);
      const newId = generateUniquePlacementId(existingIds, `${source.id}-copy`);
      const clone: FDraftThemePlacement = {
        ...source,
        id: newId,
        offsetX: source.offsetX + DUPLICATE_OFFSET_REM,
        offsetY: source.offsetY + DUPLICATE_OFFSET_REM,
      };
      next = addPlacement(next, location, clone);
      newIds.push(newId);
    }
    undoableTheme.commit(next);
    setSelectedPlacementIds(new Set(newIds));
  }

  function handleReorderPlacement(
    placementId: string,
    direction: Parameters<typeof reorderPlacement>[3],
  ) {
    if (!theme) return;
    undoableTheme.commit(
      reorderPlacement(theme, location, placementId, direction),
    );
  }

  function handleToggleVisible(placementId: string) {
    if (!theme) return;
    undoableTheme.commit(
      updatePlacement(theme, location, placementId, (p) => ({
        ...p,
        visible: !p.visible,
      })),
    );
  }

  function handleToggleLock(placementId: string) {
    setLockedPlacementIds((current) => {
      const next = new Set(current);
      if (next.has(placementId)) next.delete(placementId);
      else next.add(placementId);
      return next;
    });
  }

  function handleRenamePlacement(oldId: string, newId: string) {
    if (!theme) return;
    const existingIds = getPlacementsAt(theme, location).map((p) => p.id);
    if (existingIds.includes(newId)) return;
    undoableTheme.commit(
      updatePlacement(theme, location, oldId, (p) => ({ ...p, id: newId })),
    );
    setSelectedPlacementIds((current) => {
      if (!current.has(oldId)) return current;
      const next = new Set(current);
      next.delete(oldId);
      next.add(newId);
      return next;
    });
    setLockedPlacementIds((current) => {
      if (!current.has(oldId)) return current;
      const next = new Set(current);
      next.delete(oldId);
      next.add(newId);
      return next;
    });
    setGroups((current) =>
      current.map((group) => group.map((id) => (id === oldId ? newId : id))),
    );
  }

  function handleNudgePlacements(ids: string[], dxRem: number, dyRem: number) {
    if (!theme || ids.length === 0) return;
    const updates: Record<string, PlacementUpdater> = {};
    for (const id of ids) {
      updates[id] = (p) => ({
        ...p,
        offsetX: p.offsetX + dxRem,
        offsetY: p.offsetY + dyRem,
      });
    }
    handleCommitMultiple(updates);
  }

  function placeAsset(
    relativePath: string,
    naturalAspectRatio: number | null,
    atPx: { x: number; y: number } | null,
  ) {
    if (!theme) return;
    const { theme: themeWithAsset, assetId } = ensureAssetRegistered(
      theme,
      relativePath,
    );
    const existingIds = getPlacementsAt(themeWithAsset, location).map(
      (p) => p.id,
    );
    const baseName = friendlyAssetName(
      relativePath.split("/").pop() ?? "asset",
    ).replace(/\s+/g, "-");
    const placementId = generateUniquePlacementId(existingIds, baseName);
    let placement = createFixedPlacement(
      placementId,
      assetId,
      naturalAspectRatio,
      isModalStudioPage(pageId) ? "viewport" : "page",
    );
    if (atPx) {
      placement = {
        ...placement,
        offsetX: pxToRem(atPx.x - breakpoint.width / 2),
        offsetY: pxToRem(atPx.y - breakpoint.height / 2),
      };
    }
    undoableTheme.commit(addPlacement(themeWithAsset, location, placement));
    setSelectedPlacementIds(new Set([placementId]));
  }

  function handleAssetBrowserPlace(
    relativePath: string,
    naturalAspectRatio: number | null,
  ) {
    if (variantPickingPlacementId) {
      handleAddVariantAssetOption(variantPickingPlacementId, relativePath);
      return;
    }
    placeAsset(relativePath, naturalAspectRatio, null);
  }

  function handleAddVariantAssetOption(
    placementId: string,
    relativePath: string,
  ) {
    if (!theme) return;
    const { theme: themeWithAsset, assetId } = ensureAssetRegistered(
      theme,
      relativePath,
    );
    const placement = getPlacementsAt(themeWithAsset, location).find(
      (p) => p.id === placementId,
    );
    if (!placement || placement.kind !== "weighted") return;
    const baseName = friendlyAssetName(
      relativePath.split("/").pop() ?? "asset",
    );
    const option = createVariantOption(
      placement.variants.map((v) => v.id),
      assetId,
      baseName,
    );
    undoableTheme.commit(
      updatePlacement(themeWithAsset, location, placementId, (p) =>
        p.kind === "weighted" ? addVariantOption(p, option) : p,
      ),
    );
    setVariantPickingPlacementId(null);
  }

  // ---- Selection / groups ----

  function handleSelectionChange(next: Set<string>) {
    setSelectedPlacementIds(next);
  }

  function handleGroup() {
    setGroups((current) =>
      groupPlacements(current, Array.from(selectedPlacementIds)),
    );
  }

  function handleUngroup() {
    setGroups((current) =>
      ungroupPlacements(current, Array.from(selectedPlacementIds)),
    );
  }

  // ---- Align / Distribute ----

  function selectedAlignableBoxes(): AlignableBox[] {
    if (!theme) return [];
    const placements = getPlacementsAt(theme, location);
    return Array.from(selectedPlacementIds)
      .map((id) => placements.find((p) => p.id === id))
      .filter((p): p is FDraftThemePlacement => Boolean(p))
      .map((p) => {
        const { width, height } = placementWidthHeightRem(p);
        return {
          id: p.id,
          anchor: p.anchor,
          offsetX: p.offsetX,
          offsetY: p.offsetY,
          widthRem: width,
          heightRem: height,
        };
      });
  }

  function handleAlign(action: AlignAction) {
    const items = selectedAlignableBoxes();
    if (items.length < 2) return;
    const offsets = computeAlignedOffsets(
      items,
      action,
      breakpoint.width,
      breakpoint.height,
    );
    const updates: Record<string, PlacementUpdater> = {};
    for (const [id, offset] of Object.entries(offsets)) {
      updates[id] = (p) => ({
        ...p,
        offsetX: offset.offsetX,
        offsetY: offset.offsetY,
      });
    }
    handleCommitMultiple(updates);
  }

  function handleDistribute(action: DistributeAction) {
    const items = selectedAlignableBoxes();
    if (items.length < 3) return;
    const offsets = computeDistributedOffsets(
      items,
      action,
      breakpoint.width,
      breakpoint.height,
    );
    const updates: Record<string, PlacementUpdater> = {};
    for (const [id, offset] of Object.entries(offsets)) {
      updates[id] = (p) => ({
        ...p,
        offsetX: offset.offsetX,
        offsetY: offset.offsetY,
      });
    }
    handleCommitMultiple(updates);
  }

  // ---- Variant groups ----

  function handleConvertToVariantGroup(placementId: string) {
    if (!theme) return;
    undoableTheme.commit(
      updatePlacement(theme, location, placementId, (p) =>
        p.kind === "fixed" ? convertToVariantGroup(p) : p,
      ),
    );
  }

  function handleAddNothingOption(placementId: string) {
    if (!theme) return;
    const placement = getPlacementsAt(theme, location).find(
      (p) => p.id === placementId,
    );
    if (!placement || placement.kind !== "weighted") return;
    const option = createVariantOption(
      placement.variants.map((v) => v.id),
      null,
      "nothing",
    );
    undoableTheme.commit(
      updatePlacement(theme, location, placementId, (p) =>
        p.kind === "weighted" ? addVariantOption(p, option) : p,
      ),
    );
  }

  function handleRemoveVariantOption(placementId: string, optionId: string) {
    if (!theme) return;
    undoableTheme.commit(
      updatePlacement(theme, location, placementId, (p) =>
        p.kind === "weighted" ? removeVariantOption(p, optionId) : p,
      ),
    );
  }

  function handleUpdateVariantOptionWeight(
    placementId: string,
    optionId: string,
    weight: number,
  ) {
    if (!theme) return;
    undoableTheme.commit(
      updatePlacement(theme, location, placementId, (p) =>
        p.kind === "weighted"
          ? updateVariantOption(p, optionId, (v) => ({ ...v, weight }))
          : p,
      ),
    );
  }

  function handleUpdateVariantOptionAdjustments(
    placementId: string,
    optionId: string,
    updater: (
      variant: FDraftThemeWeightedVariant,
    ) => FDraftThemeWeightedVariant,
  ) {
    if (!theme) return;
    undoableTheme.commit(
      updatePlacement(theme, location, placementId, (p) =>
        p.kind === "weighted" ? updateVariantOption(p, optionId, updater) : p,
      ),
    );
  }

  function handleReorderVariantOption(
    placementId: string,
    optionId: string,
    direction: "up" | "down",
  ) {
    if (!theme) return;
    undoableTheme.commit(
      updatePlacement(theme, location, placementId, (p) =>
        p.kind === "weighted"
          ? reorderVariantOption(p, optionId, direction)
          : p,
      ),
    );
  }

  // ---- Breakpoint copy ----

  function requestCopyToBreakpoints(
    ids: string[],
    targets: FDraftThemeBreakpointId[],
  ) {
    if (!theme || ids.length === 0 || targets.length === 0) return;
    const wouldOverwrite = targets.some((target) =>
      placementCopyWouldOverwriteExisting(theme, location, ids, target),
    );
    if (wouldOverwrite) {
      setConfirmPlacementCopy({ ids, targets });
      return;
    }
    applyPlacementCopyToBreakpoints(ids, targets);
  }

  function applyPlacementCopyToBreakpoints(
    ids: string[],
    targets: FDraftThemeBreakpointId[],
  ) {
    if (!theme) return;
    let next = theme;
    for (const target of targets) {
      next = copyPlacementsToBreakpoint(next, location, ids, target);
    }
    undoableTheme.commit(next);
    setConfirmPlacementCopy(null);
  }

  useThemeEditorShortcuts({
    enabled: mode === "edit" && Boolean(theme),
    selectedPlacementIds,
    onDelete: handleDeletePlacements,
    onCopy: handleCopyPlacements,
    onPaste: handlePastePlacements,
    onDuplicate: handleDuplicatePlacements,
    onUndo: undoableTheme.undo,
    onRedo: undoableTheme.redo,
    onNudge: handleNudgePlacements,
    onGroup: handleGroup,
    onUngroup: handleUngroup,
  });

  // Fullscreen Edit toggle (Ctrl/Cmd+Shift+F — see §8) and Escape (§7) —
  // a separate listener from `useThemeEditorShortcuts` since it applies
  // regardless of selection and isn't a placement-editing action.
  // Escape's priority (§7's "should first respect any currently active
  // crop/modal operation"): close an active crop first, then a floating
  // drawer, then Fullscreen Edit itself — never more than one of these
  // per keypress, so a single Escape never surprises the user by jumping
  // two levels at once.
  useEffect(() => {
    if (mode !== "edit") return;
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        setFullscreenEdit((value) => !value);
        return;
      }
      if (event.key === "Escape") {
        if (cropPlacementId !== null) {
          setCropPlacementId(null);
        } else if (openDrawer !== null) {
          setOpenDrawer(null);
        } else if (fullscreenEdit) {
          setFullscreenEdit(false);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, cropPlacementId, openDrawer, fullscreenEdit]);

  const safeZoneWarnings = useMemo(() => {
    if (!theme || selectedPlacementIds.size !== 1) return [];
    const [id] = Array.from(selectedPlacementIds);
    const placement = getPlacementsAt(theme, location).find((p) => p.id === id);
    if (!placement) return [];
    const { width, height } = placementWidthHeightRem(placement);
    const box = resolvePlacementBoxPx(
      placement.anchor,
      placement.offsetX,
      placement.offsetY,
      width,
      height,
      breakpoint.width,
      breakpoint.height,
    );
    return findSafeZoneOverlapWarnings(
      box,
      breakpoint.width,
      breakpoint.height,
    );
  }, [theme, selectedPlacementIds, location, breakpoint]);

  async function handleChangeWorkspaceFolder() {
    if (!profileId) return;
    setWorkspaceError(null);
    setIsPickingWorkspace(true);
    try {
      const picked = await pickEventArtWorkspaceFolder();
      if (!picked) {
        return;
      }
      const validation = await validateEventArtWorkspaceFolder(picked);
      if (!validation.valid) {
        setWorkspaceError(
          `That folder doesn't look like an FDraft repository — missing: ${validation.missing.join(", ")}.`,
        );
        return;
      }
      await setEventArtWorkspacePath(repositories, profileId, picked);
      await reloadWorkspacePath();
    } finally {
      setIsPickingWorkspace(false);
    }
  }

  async function handleDisconnectWorkspace() {
    if (!profileId) return;
    await clearEventArtWorkspacePath(repositories, profileId);
    setWorkspaceError(null);
    await reloadWorkspacePath();
  }

  // Import / Replace / Delete (see docs/updates, "EVENT STUDIO — PHASE
  // 9" §3/§6/§14) — the project's own `public/events/` tree is the ONLY
  // canonical asset store (§7: "no duplicate art storage"); every one of
  // these actions copies/removes a real project file and then bumps
  // `assetRefreshToken` so the Asset Browser rescans the SAME filesystem
  // truth it always reads from, never a second in-memory copy.
  async function handleRequestImport() {
    if (!workspacePath) return;
    const source = await pickImportSourceFile();
    if (!source) return;
    setImportSourcePath(source);
    setImportDialogOpen(true);
  }

  function handleImported() {
    setAssetRefreshToken((token) => token + 1);
    setProjectChanges((current) => ({
      ...current,
      imported: current.imported + 1,
    }));
  }

  async function handleRequestReplace(asset: WorkspaceAssetEntry) {
    if (!workspacePath) return;
    const source = await pickImportSourceFile();
    if (!source) return;
    setPendingReplace({ asset, sourcePath: source });
  }

  async function confirmReplace() {
    if (!pendingReplace || !workspacePath) return;
    const { asset, sourcePath } = pendingReplace;
    setPendingReplace(null);
    const result = await copyEventArtAsset(
      workspacePath,
      sourcePath,
      asset.eventId,
      asset.category,
      asset.fileName,
    );
    if (result.ok) {
      setAssetRefreshToken((token) => token + 1);
      setProjectChanges((current) => ({
        ...current,
        replaced: current.replaced + 1,
      }));
    } else {
      setAssetActionError(result.error);
    }
  }

  function handleRequestDelete(asset: WorkspaceAssetEntry) {
    const matchingAssetIds = theme
      ? Object.entries(theme.assets)
          .filter(([, path]) => path === asset.relativePath)
          .map(([assetId]) => assetId)
      : [];
    const references = theme
      ? matchingAssetIds.flatMap((assetId) =>
          findAssetReferences(theme, assetId),
        )
      : [];
    setPendingDeleteAsset(asset);
    setDeleteReferences(references);
  }

  async function confirmDeleteAsset() {
    if (!pendingDeleteAsset || !workspacePath) return;
    const asset = pendingDeleteAsset;
    setPendingDeleteAsset(null);
    setDeleteReferences([]);
    const result = await deleteEventArtAsset(workspacePath, asset.relativePath);
    if (result.ok) {
      setAssetRefreshToken((token) => token + 1);
      setProjectChanges((current) => ({
        ...current,
        deleted: current.deleted + 1,
      }));
    } else {
      setAssetActionError(result.error);
    }
  }

  if (!isEventStudioBuild) {
    return (
      <p className="text-muted-foreground text-sm">
        Event Studio is only available in FDraft (Dev).
      </p>
    );
  }

  const previewSrc = `/studio-preview?db=${encodeURIComponent(previewDbName)}&page=${encodeURIComponent(pageId)}&state=${encodeURIComponent(stateId)}&preset=${encodeURIComponent(presetId)}`;

  const firstSelectedId =
    selectedPlacementIds.size === 1
      ? Array.from(selectedPlacementIds)[0]!
      : null;

  const assetsPanelBody = (
    <>
      <AssetBrowserPanel
        workspacePath={workspacePath ?? null}
        onPlaceAsset={(relativePath, naturalAspectRatio) => {
          handleAssetBrowserPlace(relativePath, naturalAspectRatio);
          // Quick auto-close (see docs/updates, "EVENT STUDIO — PHASE 8"
          // §6) — placing something is usually the whole reason the
          // drawer was opened; Pin Panel opts out for anyone placing
          // several assets in a row.
          if (fullscreenEdit && !assetsPanelPinned) {
            setOpenDrawer(null);
          }
        }}
        pickerBannerText={
          variantPickingPlacementId
            ? `Picking an asset for "${variantPickingPlacementId}" — click one below.`
            : undefined
        }
        onCancelPicker={() => setVariantPickingPlacementId(null)}
        onRequestImport={
          workspacePath ? () => void handleRequestImport() : undefined
        }
        onRequestReplace={
          workspacePath
            ? (asset) => void handleRequestReplace(asset)
            : undefined
        }
        onRequestDelete={workspacePath ? handleRequestDelete : undefined}
        refreshToken={assetRefreshToken}
      />
      {assetActionError ? (
        <p className="text-destructive text-xs" role="alert">
          {assetActionError}
        </p>
      ) : null}
      {projectChanges.imported +
        projectChanges.replaced +
        projectChanges.deleted >
      0 ? (
        <div className="border-border bg-muted/30 rounded border p-2 text-[0.65rem]">
          <p className="text-foreground font-semibold">Project</p>
          {projectChanges.imported > 0 ? (
            <p className="text-muted-foreground">
              {projectChanges.imported} image
              {projectChanges.imported === 1 ? "" : "s"} added
            </p>
          ) : null}
          {projectChanges.replaced > 0 ? (
            <p className="text-muted-foreground">
              {projectChanges.replaced} image
              {projectChanges.replaced === 1 ? "" : "s"} replaced
            </p>
          ) : null}
          {projectChanges.deleted > 0 ? (
            <p className="text-muted-foreground">
              {projectChanges.deleted} image
              {projectChanges.deleted === 1 ? "" : "s"} deleted
            </p>
          ) : null}
        </div>
      ) : null}
      <WorkspaceConnectSection
        workspacePath={workspacePath ?? null}
        workspaceError={workspaceError}
        isPickingWorkspace={isPickingWorkspace}
        onChangeWorkspaceFolder={() => void handleChangeWorkspaceFolder()}
        onDisconnectWorkspace={() => void handleDisconnectWorkspace()}
        onOpenWorkspaceFolder={() =>
          workspacePath
            ? void openEventArtWorkspaceFolder(workspacePath)
            : undefined
        }
      />
    </>
  );

  const importEventOptions = [
    { id: WORKSPACE_ASSET_COMMON_EVENT_ID, label: "Common" },
    ...presets.filter((preset) => preset.id !== DEFAULT_EVENT_STUDIO_PRESET_ID),
  ];

  const inspectorPanelBody = (
    <InspectorPanel
      theme={theme}
      location={location}
      selectedPlacementIds={selectedPlacementIds}
      onSelectionChange={handleSelectionChange}
      groups={groups}
      onGroup={handleGroup}
      onUngroup={handleUngroup}
      lockedPlacementIds={lockedPlacementIds}
      onToggleLock={handleToggleLock}
      freeResize={freeResize}
      onToggleFreeResize={() => setFreeResize((value) => !value)}
      cropActive={cropPlacementId !== null}
      onStartCrop={(id) => setCropPlacementId(id)}
      interactionTestMode={interactionTestMode}
      onToggleInteractionTestMode={() =>
        setInteractionTestMode((value) => !value)
      }
      onCommit={handleCommitPlacement}
      onRename={handleRenamePlacement}
      onDelete={() => handleDeletePlacements(Array.from(selectedPlacementIds))}
      onDuplicate={() =>
        handleDuplicatePlacements(Array.from(selectedPlacementIds))
      }
      onReorder={handleReorderPlacement}
      onToggleVisible={handleToggleVisible}
      onAlign={handleAlign}
      onDistribute={handleDistribute}
      onConvertToVariantGroup={handleConvertToVariantGroup}
      onStartVariantAssetPick={(id) => setVariantPickingPlacementId(id)}
      onAddNothingOption={handleAddNothingOption}
      onRemoveVariantOption={handleRemoveVariantOption}
      onUpdateVariantOptionWeight={handleUpdateVariantOptionWeight}
      onUpdateVariantOptionAdjustments={handleUpdateVariantOptionAdjustments}
      onReorderVariantOption={handleReorderVariantOption}
      previewSeed={previewSeed}
      onRerollPreview={() => setPreviewSeed(crypto.randomUUID())}
      onResetPreviewSeed={() => setPreviewSeed(DEFAULT_PREVIEW_SEED)}
      onCopyToBreakpoint={(target) =>
        requestCopyToBreakpoints(Array.from(selectedPlacementIds), [target])
      }
      onCopyToAllBreakpoints={() =>
        requestCopyToBreakpoints(
          Array.from(selectedPlacementIds),
          otherBreakpoints(breakpointId),
        )
      }
      safeZoneWarnings={safeZoneWarnings}
    />
  );

  const toolbarElement = (
    <StudioToolbar
      presetId={presetId}
      presets={presets}
      onPresetChange={setPresetId}
      pages={pages}
      pageId={pageId}
      onPageChange={(id) => {
        setPageId(id);
        const def = getStudioPage(id);
        setStateId(def?.states[0]?.id ?? "");
      }}
      currentPage={currentPage}
      stateId={stateId}
      onStateChange={setStateId}
      breakpointId={breakpointId}
      onBreakpointChange={setBreakpointId}
      showSafeZones={showSafeZones}
      onToggleSafeZones={() => setShowSafeZones((value) => !value)}
      onEnterPreview={() => setMode("preview")}
      zoomSetting={zoomSetting}
      effectiveZoom={effectiveZoom}
      onZoomChange={setZoomSetting}
      themeSource={themeSource}
      themeLoading={themeLoading}
      hasUnsavedChanges={hasUnsavedChanges}
      lastSavedAt={lastSavedAt}
      canSave={Boolean(theme && profileId)}
      onLoad={requestLoad}
      onSave={() => void handleSave()}
      onOpenFile={() => setFilePanelOpen(true)}
      onCopyDesktopToTablet={() => requestCopyBreakpoint("desktop", "tablet")}
      onCopyTabletToMobile={() => requestCopyBreakpoint("tablet", "mobile")}
      copyDisabled={!theme}
      canUndo={undoableTheme.canUndo}
      canRedo={undoableTheme.canRedo}
      onUndo={undoableTheme.undo}
      onRedo={undoableTheme.redo}
      snapToGrid={snapToGrid}
      onToggleSnapToGrid={() => setSnapToGrid((v) => !v)}
      snapToPage={snapToPage}
      onToggleSnapToPage={() => setSnapToPage((v) => !v)}
      snapToCenter={snapToCenter}
      onToggleSnapToCenter={() => setSnapToCenter((v) => !v)}
      snapToObjects={snapToObjects}
      onToggleSnapToObjects={() => setSnapToObjects((v) => !v)}
      showGrid={showGrid}
      onToggleShowGrid={() => setShowGrid((v) => !v)}
      gridSizePx={gridSizePx}
      onGridSizeChange={setGridSizePx}
      onEnterFullscreenEdit={() => setFullscreenEdit(true)}
    />
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {mode === "edit" && !fullscreenEdit ? toolbarElement : null}

      {mode === "edit" && !fullscreenEdit && recoverableAutosave ? (
        <div className="border-border bg-card flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <p className="text-foreground text-xs">
            An autosaved version from{" "}
            {new Date(recoverableAutosave.savedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            wasn&apos;t saved deliberately — restore it?
          </p>
          <div className="ml-auto flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRestoreAutosave}
            >
              Restore
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleDiscardAutosave()}
            >
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-2">
        {mode === "edit" && !fullscreenEdit ? (
          <div className="border-border bg-card flex w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border p-3">
            {assetsPanelBody}
          </div>
        ) : null}

        <div
          ref={setPreviewAreaEl}
          className="relative flex min-w-0 flex-1 items-start justify-center overflow-auto rounded-lg border border-dashed p-4"
        >
          {mode === "preview" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute top-2 right-2 z-10"
              onClick={() => setMode("edit")}
            >
              Exit Preview
            </Button>
          ) : null}
          {mode === "edit" && fullscreenEdit ? (
            <FullscreenEditOverlay
              canUndo={undoableTheme.canUndo}
              canRedo={undoableTheme.canRedo}
              onUndo={undoableTheme.undo}
              onRedo={undoableTheme.redo}
              onExitFullscreen={() => setFullscreenEdit(false)}
              onOpenDrawer={setOpenDrawer}
              selectedCount={selectedPlacementIds.size}
              firstSelectedId={firstSelectedId}
              lockedPlacementIds={lockedPlacementIds}
              onDeleteSelection={() =>
                handleDeletePlacements(Array.from(selectedPlacementIds))
              }
              onDuplicateSelection={() =>
                handleDuplicatePlacements(Array.from(selectedPlacementIds))
              }
              onBringForward={(id) => handleReorderPlacement(id, "forward")}
              onSendBack={(id) => handleReorderPlacement(id, "backward")}
              onToggleLock={handleToggleLock}
              onStartCrop={(id) => setCropPlacementId(id)}
            />
          ) : null}
          <div
            style={{
              width: breakpoint.width * effectiveZoom,
              height: breakpoint.height * effectiveZoom,
            }}
          >
            <div
              className="relative shrink-0 origin-top-left overflow-hidden rounded border bg-white shadow-sm"
              style={{
                width: breakpoint.width,
                height: breakpoint.height,
                transform: `scale(${effectiveZoom})`,
              }}
            >
              <iframe
                key={previewDbName}
                src={previewSrc}
                title="FDraft preview"
                className="h-full w-full border-0"
              />
              {mode === "edit" && theme ? (
                <EditableThemeCanvas
                  theme={theme}
                  location={location}
                  width={breakpoint.width}
                  height={breakpoint.height}
                  zoom={effectiveZoom}
                  selectedPlacementIds={selectedPlacementIds}
                  onSelectionChange={handleSelectionChange}
                  groups={groups}
                  lockedPlacementIds={lockedPlacementIds}
                  freeResize={freeResize}
                  cropPlacementId={cropPlacementId}
                  interactionTestMode={interactionTestMode}
                  previewSeed={previewSeed}
                  snap={{
                    toGrid: snapToGrid,
                    toPage: snapToPage,
                    toCenter: snapToCenter,
                    toObjects: snapToObjects,
                    gridSizePx,
                  }}
                  showGrid={showGrid}
                  onCommit={handleCommitPlacement}
                  onCommitMultiple={handleCommitMultiple}
                  onDropAsset={(assetId, x, y) =>
                    placeAsset(assetId, null, { x, y })
                  }
                  onCloseCrop={() => setCropPlacementId(null)}
                />
              ) : null}
              {mode === "edit" && showSafeZones ? <SafeZoneOverlay /> : null}
            </div>
          </div>
        </div>

        {mode === "edit" && !fullscreenEdit ? inspectorPanelBody : null}
      </div>

      {/* Fullscreen Edit's floating panel drawers (see docs/updates,
          "EVENT STUDIO — PHASE 8" §4/§5) — `Sheet` is a fixed-position
          portal, never part of the flex layout above, so opening one of
          these never resizes/reflows the canvas. */}
      <Sheet
        open={fullscreenEdit && openDrawer === "assets"}
        onOpenChange={(open) => {
          if (!open) setOpenDrawer(null);
        }}
      >
        <SheetContent side="left" className="w-72 gap-3 p-3 sm:max-w-none">
          <SheetHeader className="flex-row items-center justify-between space-y-0 p-0">
            <SheetTitle className="sr-only">Asset Browser drawer</SheetTitle>
            <Button
              type="button"
              variant={assetsPanelPinned ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setAssetsPanelPinned((value) => !value)}
              title={
                assetsPanelPinned
                  ? "Pinned open — placing an asset won't close this drawer"
                  : "Pin open so placing an asset doesn't close this drawer"
              }
            >
              {assetsPanelPinned ? (
                <Pin aria-hidden="true" />
              ) : (
                <PinOff aria-hidden="true" />
              )}
              Pin Panel
            </Button>
          </SheetHeader>
          {assetsPanelBody}
        </SheetContent>
      </Sheet>

      <Sheet
        open={fullscreenEdit && openDrawer === "inspector"}
        onOpenChange={(open) => {
          if (!open) setOpenDrawer(null);
        }}
      >
        <SheetContent side="right" className="w-80 p-0 sm:max-w-none">
          {inspectorPanelBody}
        </SheetContent>
      </Sheet>

      <Sheet
        open={fullscreenEdit && openDrawer === "toolbar"}
        onOpenChange={(open) => {
          if (!open) setOpenDrawer(null);
        }}
      >
        <SheetContent side="top" className="h-auto gap-0 p-3 sm:max-w-none">
          <SheetHeader className="sr-only">
            <SheetTitle>Studio toolbar</SheetTitle>
          </SheetHeader>
          {toolbarElement}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmCopy !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmCopy(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite existing layout?</AlertDialogTitle>
            <AlertDialogDescription>
              The destination breakpoint already has placements that differ from
              the source. Copying will replace them — breakpoints stay
              independently editable afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmCopy) {
                  applyCopyBreakpoint(confirmCopy.from, confirmCopy.to);
                }
              }}
            >
              Copy anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmPlacementCopy !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmPlacementCopy(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite existing placement?</AlertDialogTitle>
            <AlertDialogDescription>
              One or more of the destination breakpoints already has a placement
              with the same id that differs from what you&apos;re copying.
              Copying will replace it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmPlacementCopy) {
                  applyPlacementCopyToBreakpoints(
                    confirmPlacementCopy.ids,
                    confirmPlacementCopy.targets,
                  );
                }
              }}
            >
              Copy anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmLoad} onOpenChange={setConfirmLoad}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Loading replaces the editor with the last deliberately Saved
              version. Your current unsaved changes will be lost unless you Undo
              right after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmLoad(false);
                void loadTheme(presetId);
              }}
            >
              Load anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StudioFilePanel
        open={filePanelOpen}
        onOpenChange={setFilePanelOpen}
        profileId={profileId}
        repositories={repositories}
        presetId={presetId}
        presetLabel={
          presets.find((preset) => preset.id === presetId)?.label ?? presetId
        }
        pageId={pageId}
        pageLabel={currentPage.label}
        stateId={stateId}
        breakpointId={breakpointId}
        breakpointLabel={breakpoint.label}
        theme={theme}
        workspacePath={workspacePath ?? null}
        onCommitTheme={(next) => undoableTheme.commit(next)}
      />

      {workspacePath && importSourcePath ? (
        <ImportAssetDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          workspacePath={workspacePath}
          sourcePath={importSourcePath}
          eventOptions={importEventOptions}
          defaultEventId={
            presetId !== DEFAULT_EVENT_STUDIO_PRESET_ID
              ? presetId
              : WORKSPACE_ASSET_COMMON_EVENT_ID
          }
          onImported={handleImported}
        />
      ) : null}

      <AlertDialog
        open={pendingReplace !== null}
        onOpenChange={(open) => {
          if (!open) setPendingReplace(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this image?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingReplace ? (
                <>
                  The new file overwrites{" "}
                  <span className="font-mono">
                    public/{pendingReplace.asset.relativePath}
                  </span>
                  . The asset path stays exactly the same, so every layout
                  already using it shows the replacement immediately.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmReplace()}>
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteAsset !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteAsset(null);
            setDeleteReferences([]);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDeleteAsset?.fileName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteReferences.length > 0 ? (
                <>
                  This image is used in:
                  <ul className="mt-1 list-inside list-disc">
                    {deleteReferences.map((reference, index) => (
                      <li key={index}>{formatAssetReference(reference)}</li>
                    ))}
                  </ul>
                </>
              ) : (
                "Not currently used in the loaded theme. This permanently removes the file from the project."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteAsset()}>
              {deleteReferences.length > 0 ? "Delete anyway" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StudioToolbar({
  presetId,
  presets,
  onPresetChange,
  pages,
  pageId,
  onPageChange,
  currentPage,
  stateId,
  onStateChange,
  breakpointId,
  onBreakpointChange,
  showSafeZones,
  onToggleSafeZones,
  onEnterPreview,
  zoomSetting,
  effectiveZoom,
  onZoomChange,
  themeSource,
  themeLoading,
  hasUnsavedChanges,
  lastSavedAt,
  canSave,
  onLoad,
  onSave,
  onOpenFile,
  onCopyDesktopToTablet,
  onCopyTabletToMobile,
  copyDisabled,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  snapToGrid,
  onToggleSnapToGrid,
  snapToPage,
  onToggleSnapToPage,
  snapToCenter,
  onToggleSnapToCenter,
  snapToObjects,
  onToggleSnapToObjects,
  showGrid,
  onToggleShowGrid,
  gridSizePx,
  onGridSizeChange,
  onEnterFullscreenEdit,
}: {
  presetId: string;
  presets: { id: string; label: string }[];
  onPresetChange: (id: string) => void;
  pages: typeof STUDIO_PAGES;
  pageId: StudioPageId;
  onPageChange: (id: StudioPageId) => void;
  currentPage: (typeof STUDIO_PAGES)[number];
  stateId: string;
  onStateChange: (id: string) => void;
  breakpointId: FDraftThemeBreakpointId;
  onBreakpointChange: (id: FDraftThemeBreakpointId) => void;
  showSafeZones: boolean;
  onToggleSafeZones: () => void;
  onEnterPreview: () => void;
  zoomSetting: "fit" | number;
  effectiveZoom: number;
  onZoomChange: (value: "fit" | number) => void;
  themeSource: "canonical" | "working" | "none";
  themeLoading: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: string | null;
  canSave: boolean;
  onLoad: () => void;
  onSave: () => void;
  onOpenFile: () => void;
  onCopyDesktopToTablet: () => void;
  onCopyTabletToMobile: () => void;
  copyDisabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  snapToPage: boolean;
  onToggleSnapToPage: () => void;
  snapToCenter: boolean;
  onToggleSnapToCenter: () => void;
  snapToObjects: boolean;
  onToggleSnapToObjects: () => void;
  showGrid: boolean;
  onToggleShowGrid: () => void;
  gridSizePx: number;
  onGridSizeChange: (size: number) => void;
  onEnterFullscreenEdit: () => void;
}) {
  console.error("DEBUG StudioToolbar render", {
    themeLoading,
    themeSource,
    hasUnsavedChanges,
    lastSavedAt,
  });
  return (
    <div className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3">
      <div>
        <h1 className="page-heading text-lg">Event Studio</h1>
      </div>

      <ToolbarSelect
        label="Preset"
        value={presetId}
        onChange={onPresetChange}
        options={presets.map((preset) => ({
          value: preset.id,
          label: preset.label,
        }))}
      />

      <ToolbarSelect
        label="Page"
        value={pageId}
        onChange={(value) => onPageChange(value as StudioPageId)}
        options={pages.map((page) => ({ value: page.id, label: page.label }))}
      />

      <ToolbarSelect
        label="State"
        value={stateId}
        onChange={onStateChange}
        options={currentPage.states.map((state) => ({
          value: state.id,
          label: state.label,
        }))}
      />

      <ToolbarSelect
        label="Breakpoint"
        value={breakpointId}
        onChange={(value) =>
          onBreakpointChange(value as FDraftThemeBreakpointId)
        }
        options={STUDIO_BREAKPOINTS.map((breakpoint) => ({
          value: breakpoint.id,
          label: `${breakpoint.label} (${breakpoint.width}×${breakpoint.height})`,
        }))}
      />

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Ctrl/Cmd+Z)"
        >
          Undo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          Redo
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={onLoad}>
          Load
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canSave}
          onClick={onSave}
        >
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onOpenFile}>
          File…
        </Button>
        <span className="text-muted-foreground text-xs">
          {themeLoading
            ? "Loading…"
            : themeSource === "working"
              ? hasUnsavedChanges
                ? "Unsaved changes"
                : lastSavedAt
                  ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Working copy"
              : themeSource === "canonical"
                ? "Canonical"
                : "No theme"}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={copyDisabled}
          onClick={onCopyDesktopToTablet}
        >
          Copy Desktop → Tablet
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={copyDisabled}
          onClick={onCopyTabletToMobile}
        >
          Copy Tablet → Mobile
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-xs">Snap:</span>
        <ToolbarToggle
          label="Grid"
          active={snapToGrid}
          onClick={onToggleSnapToGrid}
        />
        <ToolbarToggle
          label="Page"
          active={snapToPage}
          onClick={onToggleSnapToPage}
        />
        <ToolbarToggle
          label="Centre"
          active={snapToCenter}
          onClick={onToggleSnapToCenter}
        />
        <ToolbarToggle
          label="Objects"
          active={snapToObjects}
          onClick={onToggleSnapToObjects}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <ToolbarToggle
          label="Grid overlay"
          active={showGrid}
          onClick={onToggleShowGrid}
        />
        <label className="text-muted-foreground flex items-center gap-1 text-xs">
          Size
          <input
            type="number"
            min={4}
            step={4}
            value={gridSizePx}
            onChange={(event) =>
              onGridSizeChange(Number(event.target.value) || 20)
            }
            className="border-border bg-background w-14 rounded border px-1 py-0.5 text-xs"
          />
        </label>
      </div>

      <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
        Zoom
        <select
          className="border-border bg-background text-foreground rounded border px-1.5 py-1 text-xs"
          value={String(zoomSetting)}
          onChange={(event) => {
            const value = event.target.value;
            onZoomChange(value === "fit" ? "fit" : Number(value));
          }}
        >
          <option value="fit">Fit</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
          <option value="1.25">125%</option>
          <option value="1.5">150%</option>
        </select>
        {zoomSetting === "fit" ? (
          <span>({Math.round(effectiveZoom * 100)}%)</span>
        ) : null}
      </label>

      <div className="ml-auto flex items-center gap-1.5">
        <KeyboardShortcutsPopover />
        <Button
          type="button"
          variant={showSafeZones ? "secondary" : "outline"}
          size="sm"
          onClick={onToggleSafeZones}
        >
          Safe Zones
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEnterPreview}
        >
          Preview
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEnterFullscreenEdit}
          title="Fullscreen Edit (Ctrl/Cmd+Shift+F)"
        >
          <Maximize2 aria-hidden="true" />
          Fullscreen Edit
        </Button>
        {isDesktopRuntime() ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void toggleWindowFullscreen()}
            title="Enter Window Fullscreen — the OS window itself, separate from Fullscreen Edit"
          >
            <Monitor aria-hidden="true" />
            <span className="sr-only">Enter Window Fullscreen</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

const KEYBOARD_SHORTCUTS: readonly { combo: string; action: string }[] = [
  { combo: "Ctrl/Cmd+Z", action: "Undo" },
  { combo: "Ctrl/Cmd+Shift+Z", action: "Redo" },
  { combo: "Ctrl/Cmd+C", action: "Copy selection" },
  { combo: "Ctrl/Cmd+V", action: "Paste" },
  { combo: "Ctrl/Cmd+D", action: "Duplicate selection" },
  { combo: "Ctrl/Cmd+G", action: "Group selection" },
  { combo: "Ctrl/Cmd+Shift+G", action: "Ungroup selection" },
  { combo: "Delete / Backspace", action: "Delete selection" },
  { combo: "Arrow keys", action: "Nudge selection" },
  { combo: "Shift + Arrow keys", action: "Nudge selection (larger step)" },
  { combo: "Shift-click / drag", action: "Multi-select" },
  { combo: "Ctrl/Cmd+Shift+F", action: "Toggle Fullscreen Edit" },
  { combo: "Escape", action: "Close crop / drawer / exit Fullscreen Edit" },
];

/** A compact reference, not a wizard (§4: "Do not create a long onboarding wizard") — every shortcut in one small popover, opened on demand. */
function KeyboardShortcutsPopover() {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
      >
        Shortcuts
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <h3 className="text-foreground mb-2 text-sm font-semibold">
          Keyboard Shortcuts
        </h3>
        <dl className="space-y-1">
          {KEYBOARD_SHORTCUTS.map((entry) => (
            <div
              key={entry.combo}
              className="flex justify-between gap-3 text-xs"
            >
              <dt className="text-muted-foreground">{entry.action}</dt>
              <dd className="text-foreground font-mono">{entry.combo}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function ToolbarToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      size="xs"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function ToolbarSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
      {label}
      <select
        className="border-border bg-background text-foreground rounded border px-1.5 py-1 text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function WorkspaceConnectSection({
  workspacePath,
  workspaceError,
  isPickingWorkspace,
  onChangeWorkspaceFolder,
  onDisconnectWorkspace,
  onOpenWorkspaceFolder,
}: {
  workspacePath: string | null;
  workspaceError: string | null;
  isPickingWorkspace: boolean;
  onChangeWorkspaceFolder: () => void;
  onDisconnectWorkspace: () => void;
  onOpenWorkspaceFolder: () => void;
}) {
  return (
    <div className="border-border mt-auto space-y-2 border-t pt-3">
      <h2 className="text-foreground text-sm font-semibold">FDraft Project</h2>
      {workspacePath ? (
        <div className="space-y-1.5">
          <p className="text-foreground text-xs font-medium">
            <span aria-hidden="true">✓</span> Connected
          </p>
          <p className="text-muted-foreground truncate font-mono text-[0.65rem]">
            {workspacePath}
          </p>
          <dl className="text-muted-foreground space-y-0.5 text-[0.65rem]">
            <div className="flex gap-1">
              <dt className="shrink-0">Event Art:</dt>
              <dd className="font-mono">public/events/</dd>
            </div>
            <div className="flex gap-1">
              <dt className="shrink-0">Themes:</dt>
              <dd className="font-mono">public/event-themes/</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Not connected. This is your actual FDraft Git checkout — not a
          separate art library.
        </p>
      )}
      {workspaceError ? (
        <p className="text-destructive text-xs" role="alert">
          {workspaceError}
        </p>
      ) : null}
      {!isDesktopRuntime() ? (
        <p className="text-muted-foreground text-[0.65rem]">
          Needs the desktop app.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {workspacePath ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenWorkspaceFolder}
            >
              Open Folder
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPickingWorkspace}
            onClick={onChangeWorkspaceFolder}
          >
            {workspacePath ? "Change Project" : "Connect Project"}
          </Button>
          {workspacePath ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDisconnectWorkspace}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Fullscreen Edit's own chrome (see docs/updates, "EVENT STUDIO — PHASE
 * 8" §4/§14) — a `pointer-events-none` full-bleed layer over the canvas
 * with individually `pointer-events-auto` controls, so every pixel NOT
 * covered by an actual button still reaches the canvas underneath
 * untouched. Two pieces: the always-visible corner cluster (Exit
 * Fullscreen + Undo/Redo, kept out of a drawer since they're used
 * constantly — burying them would make the workflow "annoying," which
 * §6 explicitly warns against) plus the three edge tabs that pop the
 * Assets/Inspector/Toolbar drawers open, and a small floating selection
 * toolbar (§14) with just the highest-frequency actions — Delete/
 * Duplicate always; Bring Forward/Send Back/Lock/Crop only for a single
 * selection, matching the Inspector's own existing single-selection
 * gating for those same actions. Detailed values stay in the Inspector
 * drawer — this never duplicates it.
 */
function FullscreenEditOverlay({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExitFullscreen,
  onOpenDrawer,
  selectedCount,
  firstSelectedId,
  lockedPlacementIds,
  onDeleteSelection,
  onDuplicateSelection,
  onBringForward,
  onSendBack,
  onToggleLock,
  onStartCrop,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExitFullscreen: () => void;
  onOpenDrawer: (drawer: "assets" | "inspector" | "toolbar") => void;
  selectedCount: number;
  firstSelectedId: string | null;
  lockedPlacementIds: ReadonlySet<string>;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onBringForward: (id: string) => void;
  onSendBack: (id: string) => void;
  onToggleLock: (id: string) => void;
  onStartCrop: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="border-border bg-card/95 pointer-events-auto absolute top-2 left-2 flex items-center gap-1 rounded-lg border p-1 shadow-sm backdrop-blur-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onExitFullscreen}
          title="Exit Fullscreen (Esc)"
        >
          <Minimize2 aria-hidden="true" />
          <span className="sr-only">Exit Fullscreen</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Ctrl/Cmd+Z)"
        >
          <Undo2 aria-hidden="true" />
          <span className="sr-only">Undo</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          <Redo2 aria-hidden="true" />
          <span className="sr-only">Redo</span>
        </Button>
      </div>

      <button
        type="button"
        onClick={() => onOpenDrawer("toolbar")}
        className="border-border bg-card/95 text-muted-foreground hover:text-foreground pointer-events-auto absolute top-0 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-b-lg border border-t-0 px-3 py-1 text-xs shadow-sm backdrop-blur-sm"
      >
        <Wrench aria-hidden="true" className="size-3.5" />
        Toolbar
      </button>

      <button
        type="button"
        onClick={() => onOpenDrawer("assets")}
        className="border-border bg-card/95 text-muted-foreground hover:text-foreground pointer-events-auto absolute top-1/2 left-0 flex -translate-y-1/2 items-center gap-1 rounded-r-lg border border-l-0 px-2 py-3 text-xs shadow-sm backdrop-blur-sm [writing-mode:vertical-rl]"
      >
        <ImagePlus aria-hidden="true" className="size-3.5 rotate-90" />
        Assets
      </button>

      <button
        type="button"
        onClick={() => onOpenDrawer("inspector")}
        className="border-border bg-card/95 text-muted-foreground hover:text-foreground pointer-events-auto absolute top-1/2 right-0 flex -translate-y-1/2 items-center gap-1 rounded-l-lg border border-r-0 px-2 py-3 text-xs shadow-sm backdrop-blur-sm [writing-mode:vertical-rl]"
      >
        <SlidersHorizontal aria-hidden="true" className="size-3.5 rotate-90" />
        Inspector
      </button>

      {selectedCount > 0 ? (
        <div className="border-border bg-card/95 pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border p-1 shadow-sm backdrop-blur-sm">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDeleteSelection}
            title="Delete"
          >
            <Trash2 aria-hidden="true" />
            <span className="sr-only">Delete</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDuplicateSelection}
            title="Duplicate"
          >
            <Copy aria-hidden="true" />
            <span className="sr-only">Duplicate</span>
          </Button>
          {firstSelectedId ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onBringForward(firstSelectedId)}
                title="Bring Forward"
              >
                <ChevronUp aria-hidden="true" />
                <span className="sr-only">Bring Forward</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onSendBack(firstSelectedId)}
                title="Send Back"
              >
                <ChevronDown aria-hidden="true" />
                <span className="sr-only">Send Back</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onToggleLock(firstSelectedId)}
                title={
                  lockedPlacementIds.has(firstSelectedId) ? "Unlock" : "Lock"
                }
              >
                {lockedPlacementIds.has(firstSelectedId) ? (
                  <LockOpen aria-hidden="true" />
                ) : (
                  <Lock aria-hidden="true" />
                )}
                <span className="sr-only">
                  {lockedPlacementIds.has(firstSelectedId) ? "Unlock" : "Lock"}
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onStartCrop(firstSelectedId)}
                title="Crop"
              >
                <Crop aria-hidden="true" />
                <span className="sr-only">Crop</span>
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Edit-mode-only visual guide (see docs/updates, "EVENT STUDIO — PHASE 3"
 * §9) — approximate nav/content/edge-margin/modal regions, purely
 * decorative, `aria-hidden`, and never rendered inside `/studio-preview`
 * itself (the real renderer) — this overlay is a sibling of the iframe,
 * drawn by the Studio shell only, so it can never leak into a production
 * render. Kept in exact geometric sync with `safe-zone-check.ts`'s own
 * zone definitions (see docs/updates, "EVENT STUDIO — PHASE 5" §12).
 */
function SafeZoneOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10"
    >
      <div className="absolute inset-4 border-2 border-dashed border-blue-400/60" />
      <div className="absolute top-0 right-0 left-0 h-16 border-b-2 border-dashed border-amber-400/70 bg-amber-400/10">
        <span className="absolute top-1 left-2 text-[0.6rem] font-semibold text-amber-600 uppercase">
          Nav
        </span>
      </div>
      <div className="absolute inset-x-0 top-16 bottom-0 mx-auto w-full max-w-[1152px] border-x-2 border-dashed border-emerald-400/60">
        <span className="absolute top-1 left-2 text-[0.6rem] font-semibold text-emerald-600 uppercase">
          Content
        </span>
      </div>
      <div className="absolute top-1/2 left-1/2 h-64 w-80 -translate-x-1/2 -translate-y-1/2 border-2 border-dashed border-fuchsia-400/60">
        <span className="absolute top-1 left-2 text-[0.6rem] font-semibold text-fuchsia-600 uppercase">
          Modal / card
        </span>
      </div>
    </div>
  );
}
