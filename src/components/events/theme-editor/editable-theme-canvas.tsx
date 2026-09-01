"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Moveable from "react-moveable";
import { PlacementContent } from "../event-theme-layout-renderer";
import { placementWrapperStyle } from "../fdraft-theme-placement-css";
import {
  pxToRem,
  resolvePlacementBoxPx,
} from "@/domain/event-studio/placement-geometry";
import {
  expandSelectionWithGroups,
  findGroupContaining,
  type PlacementGroups,
} from "@/domain/event-studio/placement-groups";
import {
  getPlacementsAt,
  type PlacementLocation,
} from "@/domain/event-studio/placement-ops";
import {
  resolveFixedPlacement,
  resolveWeightedPlacement,
  type FDraftThemeResolvedPlacement,
} from "@/domain/event-themes/fdraft-theme-resolve";
import type {
  FDraftThemeFile,
  FDraftThemePlacement,
} from "@/domain/event-themes/fdraft-theme-schema";
import { useWorkspaceAssetSources } from "@/hooks/use-workspace-asset-sources";
import { CropEditorOverlay } from "./crop-editor-overlay";

export type PlacementUpdater = (
  placement: FDraftThemePlacement,
) => FDraftThemePlacement;

export interface SnapSettings {
  toGrid: boolean;
  toPage: boolean;
  toCenter: boolean;
  toObjects: boolean;
  gridSizePx: number;
}

export interface EditableThemeCanvasProps {
  theme: FDraftThemeFile;
  location: PlacementLocation;
  /** Pixel dimensions of the current breakpoint's canvas (see `STUDIO_BREAKPOINTS`). */
  width: number;
  height: number;
  /** The editor's own display zoom (see docs/updates, "EVENT STUDIO — PHASE 7" §5) — a CSS `transform: scale()` applied by an ANCESTOR of this canvas, purely for on-screen viewing. Passed through to `Moveable`'s own `zoom` prop (its documented mechanism for compensating drag/resize/rotate math for a CSS-scaled container) and used to convert raw pointer coordinates (marquee-select, asset drop) back into this canvas's own unscaled pixel space — every placement's stored `offsetX`/`offsetY`/`width`/`height` stays in that unscaled space regardless of zoom, so exported layout coordinates never change because the editor happened to be zoomed. */
  zoom: number;
  selectedPlacementIds: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  groups: PlacementGroups;
  lockedPlacementIds: ReadonlySet<string>;
  /** When true (§5: "free resize when explicitly enabled"), resize handles no longer preserve aspect ratio. */
  freeResize: boolean;
  /** The placement currently in crop-editing mode, if any — mutually exclusive with the normal move/resize/rotate handles (§6), and only ever offered for a single selection. */
  cropPlacementId: string | null;
  /** §13: in Edit mode, a registered interaction normally does NOT fire on click (clicking selects instead) — only while this is true does clicking a placement with an `interactionId` trigger its real behaviour, "a deliberate way to test interaction without making selection impossible." */
  interactionTestMode: boolean;
  /** The Studio's own rerollable seed for weighted-variant preview (see docs/updates, "EVENT STUDIO — PHASE 5" §4) — entirely separate from production's session seed; changing it only changes which variant THIS canvas currently shows. */
  previewSeed: string;
  snap: SnapSettings;
  showGrid: boolean;
  onCommit: (placementId: string, updater: PlacementUpdater) => void;
  /** One undo step covering every listed placement at once — used for group drag/resize/rotate and Align/Distribute, where "moved 4 objects" must be a single `Ctrl/Cmd+Z`, never 4 (see §11 continuing Phase 4's own coalescing discipline). */
  onCommitMultiple: (updates: Record<string, PlacementUpdater>) => void;
  /** Fired when an asset from the Asset Browser is dropped at a specific canvas position (px, relative to the canvas's own top-left) — see §4: "drag from asset browser onto page." */
  onDropAsset: (assetId: string, xPx: number, yPx: number) => void;
  /** Fired when the crop editor's own Cancel/Apply closes it — the parent owns `cropPlacementId` (it also drives the Inspector's "Crop" button state), so closing is reported upward rather than handled locally. */
  onCloseCrop: () => void;
  /** The connected FDraft Project folder, if any — threaded through to `useWorkspaceAssetSources` so a freshly imported/replaced asset (only on disk in this folder, not baked into a packaged build) still renders on the canvas. `null` outside the desktop runtime or with nothing connected, in which case placements render via their plain static path exactly as before. */
  workspacePath: string | null;
  /** Bumped after Import/Replace/Delete (see `StudioPageClient`'s own `assetRefreshToken`) — forces a re-read of any now-stale cached workspace asset, since Replace Image deliberately reuses the same path. */
  assetRefreshToken?: number;
}

/** The raw, un-cropped servable path for an asset id (see `fdraft-theme-resolve.ts`'s own private `resolveAssetPath` — duplicated here in trivial form since the crop editor specifically needs the UNCROPPED source, which `resolveFixedPlacement`'s output never exposes on its own). */
function resolveRawAssetPath(
  theme: FDraftThemeFile,
  assetId: string | null,
): string | null {
  if (assetId === null) return null;
  const relativePath = theme.assets[assetId];
  return relativePath ? `/${relativePath}` : null;
}

/** The fully-resolved height (rem), deriving from aspectRatio when `height` is null — the same rule `placementWrapperStyle` itself uses, needed anywhere geometry math (align/distribute/resize baselines) needs a definite number, never `null`. */
function resolvedHeightRem(placement: {
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
}): number {
  if (placement.height !== null) return placement.height;
  if (placement.width !== null && placement.aspectRatio !== null) {
    return placement.width / placement.aspectRatio;
  }
  return placement.width ?? 0;
}

function PlacementBox({
  resolved,
  placement,
  registerRef,
  selected,
  locked,
  inGroup,
  interactionTestMode,
  onPointerDownSelect,
}: {
  resolved: FDraftThemeResolvedPlacement;
  placement: FDraftThemePlacement;
  registerRef: (el: HTMLDivElement | null) => void;
  selected: boolean;
  locked: boolean;
  inGroup: boolean;
  interactionTestMode: boolean;
  onPointerDownSelect: (event: React.PointerEvent) => void;
}) {
  const isWeighted = placement.kind === "weighted";
  const style = placementWrapperStyle(resolved);

  return (
    <div
      ref={registerRef}
      data-fdraft-placement-id={placement.id}
      style={{
        ...style,
        pointerEvents: locked ? "none" : "auto",
        cursor: !locked ? "move" : "default",
        outline: selected
          ? inGroup
            ? "2px dashed #6366f1"
            : "2px solid #6366f1"
          : undefined,
        outlineOffset: 2,
      }}
      onPointerDown={onPointerDownSelect}
    >
      {placement.interactionId ? (
        <div className="relative size-full">
          <PlacementContent placement={resolved} />
          {!interactionTestMode ? (
            // Intercepts the click so the real interactive component
            // (e.g. the Halloween pumpkin) never fires its own behaviour
            // while merely trying to select/drag it in Edit mode — see
            // §13. Removed entirely in interaction-test mode, letting
            // clicks reach the real component underneath.
            <div className="absolute inset-0" aria-hidden="true" />
          ) : null}
        </div>
      ) : (
        <PlacementContent placement={resolved} />
      )}
      {isWeighted ? (
        <span
          aria-hidden="true"
          className="absolute -top-2 -right-2 rounded-full bg-indigo-500 px-1 text-[0.55rem] leading-4 text-white"
          title="Weighted variant group"
        >
          ⚄
        </span>
      ) : null}
    </div>
  );
}

interface DragBaseline {
  offsetX: number;
  offsetY: number;
}
interface ResizeBaseline {
  offsetX: number;
  offsetY: number;
}
interface RotateBaseline {
  rotation: number;
}

type EndEventLike = { target: Element; lastEvent?: unknown };

/** Reads the `dist`-shaped delta off a Moveable end-event's `lastEvent`, however it's spelled for that gesture kind — every one of drag/resize/rotate exposes `dist` (see the type-declaration research in this phase's own notes), so this is the ONE place that assumption lives. */
function lastEventDist(event: EndEventLike): number[] | number | undefined {
  const last = event.lastEvent as { dist?: number[] | number } | undefined;
  return last?.dist;
}
function lastEventWidthHeight(
  event: EndEventLike,
): { width: number; height: number; dragDist?: number[] } | undefined {
  const last = event.lastEvent as
    { width?: number; height?: number; drag?: { dist?: number[] } } | undefined;
  if (!last || last.width === undefined || last.height === undefined) {
    return undefined;
  }
  return { width: last.width, height: last.height, dragDist: last.drag?.dist };
}

/**
 * The Studio editor's interactive canvas (see docs/updates, "EVENT
 * STUDIO — PHASE 4" §5–§9, "EVENT STUDIO — PHASE 5" §5–§8: multiselect,
 * grouping, snapping, grid). Renders every placement for one page/state/
 * breakpoint as a real, selectable, draggable/resizable/rotatable box
 * using `react-moveable`'s native multi-target ("group") mode for 2+
 * selected elements — the SAME per-target commit math as a single
 * selection, just applied once per element in the gesture's `.events[]`
 * (Moveable itself computes each member's correct resulting position/
 * size when transforming a shared bounding box; this file never hand-
 * rolls that geometry).
 *
 * PERFORMANCE (§14, Phase 4): Moveable writes directly to each target's
 * own inline style during a gesture — no React state, no re-render —
 * until the gesture ends, when exactly one `onCommit`/`onCommitMultiple`
 * call fires.
 */
export function EditableThemeCanvas({
  theme,
  location,
  width,
  height,
  zoom,
  selectedPlacementIds,
  onSelectionChange,
  groups,
  lockedPlacementIds,
  freeResize,
  cropPlacementId,
  interactionTestMode,
  previewSeed,
  snap,
  showGrid,
  onCommit,
  onCommitMultiple,
  onDropAsset,
  onCloseCrop,
  workspacePath,
  assetRefreshToken,
}: EditableThemeCanvasProps) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const targetRefs = useRef(new Map<string, HTMLDivElement>());
  const [selectedElements, setSelectedElements] = useState<HTMLElement[]>([]);
  const [otherElements, setOtherElements] = useState<HTMLElement[]>([]);

  const dragBaselines = useRef<Map<string, DragBaseline>>(new Map());
  const resizeBaselines = useRef<Map<string, ResizeBaseline>>(new Map());
  const rotateBaselines = useRef<Map<string, RotateBaseline>>(new Map());

  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  // A plain `useState` value is only current as of the LAST completed
  // render — two pointer events dispatched back-to-back (as real
  // pointermove+pointerup input can be, and as tests firing native
  // events synchronously always are) can both run before React flushes
  // the state update from the first. Mirrored into a ref so
  // `handleCanvasPointerUp` always reads the truly-latest rect, never a
  // stale pre-render closure value.
  const marqueeRectRef = useRef<typeof marqueeRect>(null);

  const placements = getPlacementsAt(theme, location);

  const rawResolvedById = useMemo(() => {
    const map = new Map<string, FDraftThemeResolvedPlacement>();
    for (const placement of placements) {
      if (!placement.visible) continue;
      const resolved =
        placement.kind === "fixed"
          ? resolveFixedPlacement(theme, placement)
          : resolveWeightedPlacement(
              theme,
              placement,
              `${previewSeed}:${placement.id}`,
            );
      if (resolved) map.set(placement.id, resolved);
    }
    return map;
  }, [theme, placements, previewSeed]);

  const editableSelectedIds = Array.from(selectedPlacementIds).filter(
    (id) => rawResolvedById.has(id) && !lockedPlacementIds.has(id),
  );
  const singlePlacement =
    editableSelectedIds.length === 1
      ? placements.find((p) => p.id === editableSelectedIds[0])
      : undefined;
  const cropRawAssetPath =
    singlePlacement && singlePlacement.kind === "fixed"
      ? resolveRawAssetPath(theme, singlePlacement.assetId)
      : null;

  const inViewAssetPaths: (string | null)[] = [
    ...Array.from(rawResolvedById.values(), (r) => r.assetPath),
    cropRawAssetPath,
  ];
  const workspaceAssetSources = useWorkspaceAssetSources(
    workspacePath,
    inViewAssetPaths,
    assetRefreshToken,
  );
  // Falls straight through to the raw static path (unchanged behavior)
  // for anything the workspace bridge hasn't resolved yet, or when
  // there's no connected workspace at all — see `useWorkspaceAssetSources`'s
  // own doc comment for why this bridge exists at all.
  const resolvedById = useMemo(() => {
    if (Object.keys(workspaceAssetSources).length === 0) return rawResolvedById;
    const map = new Map<string, FDraftThemeResolvedPlacement>();
    for (const [id, resolved] of rawResolvedById) {
      const resolvedSrc = resolved.assetPath
        ? (workspaceAssetSources[resolved.assetPath] ?? resolved.assetPath)
        : resolved.assetPath;
      map.set(
        id,
        resolvedSrc === resolved.assetPath
          ? resolved
          : { ...resolved, assetPath: resolvedSrc },
      );
    }
    return map;
  }, [rawResolvedById, workspaceAssetSources]);
  const cropAssetPath = cropRawAssetPath
    ? (workspaceAssetSources[cropRawAssetPath] ?? cropRawAssetPath)
    : null;

  useEffect(() => {
    const elements = editableSelectedIds
      .map((id) => targetRefs.current.get(id))
      .filter((el): el is HTMLDivElement => Boolean(el));
    setSelectedElements(elements);
    // `targetRefs` is a ref (read here, not during render, so the
    // `react-hooks/refs` rule doesn't apply) — every OTHER currently-
    // rendered placement element, for `elementGuidelines` snap-to-object
    // support (see §7).
    const others = Array.from(targetRefs.current.entries())
      .filter(([id]) => !selectedPlacementIds.has(id))
      .map(([, el]) => el);
    setOtherElements(others);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlacementIds, placements.length, theme]);

  const registerRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) {
        targetRefs.current.set(id, el);
      } else {
        targetRefs.current.delete(id);
      }
    },
    [],
  );

  function selectFromPointerDown(
    placementId: string,
    event: React.PointerEvent,
  ) {
    event.stopPropagation();
    const raw = new Set(selectedPlacementIds);
    if (event.shiftKey) {
      if (raw.has(placementId)) raw.delete(placementId);
      else raw.add(placementId);
    } else if (!raw.has(placementId)) {
      raw.clear();
      raw.add(placementId);
    }
    // A plain (non-shift) click on an ALREADY-selected item keeps the
    // whole current selection intact — this is what lets a multi-select
    // be dragged by pressing on any one of its members, instead of
    // collapsing back to just that one.
    onSelectionChange(expandSelectionWithGroups(groups, raw));
  }

  function handleCanvasPointerDown(event: React.PointerEvent) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    marqueeStart.current = {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
  }

  function handleCanvasPointerMove(event: React.PointerEvent) {
    if (!marqueeStart.current || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const currentX = (event.clientX - rect.left) / zoom;
    const currentY = (event.clientY - rect.top) / zoom;
    const start = marqueeStart.current;
    const next = {
      left: Math.min(start.x, currentX),
      top: Math.min(start.y, currentY),
      width: Math.abs(currentX - start.x),
      height: Math.abs(currentY - start.y),
    };
    marqueeRectRef.current = next;
    setMarqueeRect(next);
  }

  function handleCanvasPointerUp() {
    if (!marqueeStart.current) return;
    marqueeStart.current = null;
    const rect = marqueeRectRef.current;
    marqueeRectRef.current = null;
    setMarqueeRect(null);
    if (!rect || (rect.width < 4 && rect.height < 4)) {
      // No meaningful drag — treat as a plain deselect click.
      onSelectionChange(new Set());
      return;
    }
    const hits = new Set<string>();
    for (const placement of placements) {
      const resolved = resolvedById.get(placement.id);
      if (!resolved) continue;
      const box = resolvePlacementBoxPx(
        resolved.anchor,
        resolved.offsetX,
        resolved.offsetY,
        resolved.width ?? 0,
        resolvedHeightRem(resolved),
        width,
        height,
      );
      const intersects =
        box.left < rect.left + rect.width &&
        box.left + box.width > rect.left &&
        box.top < rect.top + rect.height &&
        box.top + box.height > rect.top;
      if (intersects) hits.add(placement.id);
    }
    onSelectionChange(expandSelectionWithGroups(groups, hits));
  }

  const otherElementsForSnap = snap.toObjects ? otherElements : [];

  const horizontalGuidelines = [
    ...(snap.toPage ? [0, height] : []),
    ...(snap.toCenter ? [height / 2] : []),
  ];
  const verticalGuidelines = [
    ...(snap.toPage ? [0, width] : []),
    ...(snap.toCenter ? [width / 2] : []),
  ];
  const snappable =
    snap.toGrid || snap.toPage || snap.toCenter || snap.toObjects;

  function applyGroupDragResult(events: EndEventLike[]) {
    const updates: Record<string, PlacementUpdater> = {};
    for (const event of events) {
      const id = (event.target as HTMLElement).dataset.fdraftPlacementId;
      const dist = lastEventDist(event);
      const baseline = id ? dragBaselines.current.get(id) : undefined;
      if (!id || !Array.isArray(dist) || !baseline) continue;
      updates[id] = (placement) => ({
        ...placement,
        offsetX: baseline.offsetX + pxToRem(dist[0] ?? 0),
        offsetY: baseline.offsetY + pxToRem(dist[1] ?? 0),
      });
    }
    dragBaselines.current.clear();
    if (Object.keys(updates).length > 0) onCommitMultiple(updates);
  }

  function applyGroupResizeResult(events: EndEventLike[]) {
    const updates: Record<string, PlacementUpdater> = {};
    for (const event of events) {
      const id = (event.target as HTMLElement).dataset.fdraftPlacementId;
      const info = lastEventWidthHeight(event);
      const baseline = id ? resizeBaselines.current.get(id) : undefined;
      if (!id || !info || !baseline) continue;
      updates[id] = (placement) => ({
        ...placement,
        width: pxToRem(info.width),
        height: pxToRem(info.height),
        offsetX: info.dragDist
          ? baseline.offsetX + pxToRem(info.dragDist[0] ?? 0)
          : placement.offsetX,
        offsetY: info.dragDist
          ? baseline.offsetY + pxToRem(info.dragDist[1] ?? 0)
          : placement.offsetY,
      });
    }
    resizeBaselines.current.clear();
    if (Object.keys(updates).length > 0) onCommitMultiple(updates);
  }

  function applyGroupRotateResult(events: EndEventLike[]) {
    const updates: Record<string, PlacementUpdater> = {};
    for (const event of events) {
      const id = (event.target as HTMLElement).dataset.fdraftPlacementId;
      const dist = lastEventDist(event);
      const baseline = id ? rotateBaselines.current.get(id) : undefined;
      if (!id || typeof dist !== "number" || !baseline) continue;
      updates[id] = (placement) => ({
        ...placement,
        rotation: baseline.rotation + dist,
      });
    }
    rotateBaselines.current.clear();
    if (Object.keys(updates).length > 0) onCommitMultiple(updates);
  }

  const isGroupMode = selectedElements.length > 1;

  return (
    <div
      ref={setContainerEl}
      className="relative overflow-hidden bg-white"
      // Any `transform` value establishes a new containing block for
      // `position: fixed` descendants (CSS spec) — deliberately applied
      // here so a `coordinateSpace: "viewport"` placement stays visually
      // contained within this breakpoint-sized canvas while editing,
      // rather than escaping to the Studio app's own browser window (see
      // §7's "Positioning: Page / Viewport" — both must be predictably
      // editable within the same fixed-size box).
      style={{
        width,
        height,
        transform: "translateZ(0)",
        backgroundImage: showGrid
          ? `linear-gradient(to right, rgba(99,102,241,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,102,241,0.15) 1px, transparent 1px)`
          : undefined,
        backgroundSize: showGrid
          ? `${snap.gridSizePx}px ${snap.gridSizePx}px`
          : undefined,
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const assetId = event.dataTransfer.getData(
          "application/x-fdraft-asset-id",
        );
        if (!assetId) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onDropAsset(
          assetId,
          (event.clientX - rect.left) / zoom,
          (event.clientY - rect.top) / zoom,
        );
      }}
    >
      {placements.map((placement) => {
        const resolved = resolvedById.get(placement.id);
        if (!resolved) return null;
        return (
          <PlacementBox
            key={placement.id}
            resolved={resolved}
            placement={placement}
            registerRef={registerRef(placement.id)}
            selected={selectedPlacementIds.has(placement.id)}
            locked={lockedPlacementIds.has(placement.id)}
            inGroup={findGroupContaining(groups, placement.id) !== null}
            interactionTestMode={interactionTestMode}
            onPointerDownSelect={(event) =>
              selectFromPointerDown(placement.id, event)
            }
          />
        );
      })}

      {marqueeRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-20 border border-indigo-500 bg-indigo-500/10"
          style={marqueeRect}
        />
      ) : null}

      {selectedElements.length > 0 && cropPlacementId === null ? (
        <Moveable
          target={
            selectedElements.length === 1
              ? selectedElements[0]
              : selectedElements
          }
          container={containerEl}
          origin={false}
          zoom={zoom}
          draggable
          resizable
          rotatable
          keepRatio={!freeResize}
          throttleDrag={0}
          throttleResize={0}
          throttleRotate={0}
          snappable={snappable}
          snapGridWidth={snap.toGrid ? snap.gridSizePx : undefined}
          snapGridHeight={snap.toGrid ? snap.gridSizePx : undefined}
          horizontalGuidelines={horizontalGuidelines}
          verticalGuidelines={verticalGuidelines}
          elementGuidelines={otherElementsForSnap}
          snapThreshold={5}
          isDisplaySnapDigit={false}
          onDragStart={({ target }) => {
            const id = (target as HTMLElement).dataset.fdraftPlacementId;
            const placement = id && placements.find((p) => p.id === id);
            if (id && placement) {
              dragBaselines.current.set(id, {
                offsetX: placement.offsetX,
                offsetY: placement.offsetY,
              });
            }
          }}
          onDrag={({ target, transform }) => {
            target.style.transform = transform;
          }}
          onDragEnd={(event) => {
            const dist = lastEventDist(event);
            const id = (event.target as HTMLElement).dataset.fdraftPlacementId;
            const baseline = id ? dragBaselines.current.get(id) : undefined;
            dragBaselines.current.clear();
            if (!id || !Array.isArray(dist) || !baseline) return;
            onCommit(id, (placement) => ({
              ...placement,
              offsetX: baseline.offsetX + pxToRem(dist[0] ?? 0),
              offsetY: baseline.offsetY + pxToRem(dist[1] ?? 0),
            }));
          }}
          onDragGroupStart={({ events }) => {
            for (const event of events) {
              const id = (event.target as HTMLElement).dataset
                .fdraftPlacementId;
              const placement = id && placements.find((p) => p.id === id);
              if (id && placement) {
                dragBaselines.current.set(id, {
                  offsetX: placement.offsetX,
                  offsetY: placement.offsetY,
                });
              }
            }
          }}
          onDragGroup={({ events }) => {
            for (const event of events) {
              event.target.style.transform = event.transform;
            }
          }}
          onDragGroupEnd={({ events }) => applyGroupDragResult(events)}
          onResizeStart={({ target }) => {
            const id = (target as HTMLElement).dataset.fdraftPlacementId;
            const placement = id && placements.find((p) => p.id === id);
            if (id && placement) {
              resizeBaselines.current.set(id, {
                offsetX: placement.offsetX,
                offsetY: placement.offsetY,
              });
            }
          }}
          onResize={({ target, width: newWidth, height: newHeight, drag }) => {
            target.style.width = `${newWidth}px`;
            target.style.height = `${newHeight}px`;
            target.style.transform = drag.transform;
          }}
          onResizeEnd={(event) => {
            const info = lastEventWidthHeight(event);
            const id = (event.target as HTMLElement).dataset.fdraftPlacementId;
            const baseline = id ? resizeBaselines.current.get(id) : undefined;
            resizeBaselines.current.clear();
            if (!id || !info || !baseline) return;
            onCommit(id, (placement) => ({
              ...placement,
              width: pxToRem(info.width),
              height: pxToRem(info.height),
              offsetX: info.dragDist
                ? baseline.offsetX + pxToRem(info.dragDist[0] ?? 0)
                : placement.offsetX,
              offsetY: info.dragDist
                ? baseline.offsetY + pxToRem(info.dragDist[1] ?? 0)
                : placement.offsetY,
            }));
          }}
          onResizeGroupStart={({ events }) => {
            for (const event of events) {
              const id = (event.target as HTMLElement).dataset
                .fdraftPlacementId;
              const placement = id && placements.find((p) => p.id === id);
              if (id && placement) {
                resizeBaselines.current.set(id, {
                  offsetX: placement.offsetX,
                  offsetY: placement.offsetY,
                });
              }
            }
          }}
          onResizeGroup={({ events }) => {
            for (const event of events) {
              event.target.style.width = `${event.width}px`;
              event.target.style.height = `${event.height}px`;
              event.target.style.transform = event.drag.transform;
            }
          }}
          onResizeGroupEnd={({ events }) => applyGroupResizeResult(events)}
          onRotateStart={({ target }) => {
            const id = (target as HTMLElement).dataset.fdraftPlacementId;
            const placement = id && placements.find((p) => p.id === id);
            if (id && placement) {
              rotateBaselines.current.set(id, { rotation: placement.rotation });
            }
          }}
          onRotate={({ target, transform }) => {
            target.style.transform = transform;
          }}
          onRotateEnd={(event) => {
            const dist = lastEventDist(event);
            const id = (event.target as HTMLElement).dataset.fdraftPlacementId;
            const baseline = id ? rotateBaselines.current.get(id) : undefined;
            rotateBaselines.current.clear();
            if (!id || typeof dist !== "number" || !baseline) return;
            onCommit(id, (placement) => ({
              ...placement,
              rotation: baseline.rotation + dist,
            }));
          }}
          onRotateGroupStart={({ events }) => {
            for (const event of events) {
              const id = (event.target as HTMLElement).dataset
                .fdraftPlacementId;
              const placement = id && placements.find((p) => p.id === id);
              if (id && placement) {
                rotateBaselines.current.set(id, {
                  rotation: placement.rotation,
                });
              }
            }
          }}
          onRotateGroup={({ events }) => {
            for (const event of events) {
              event.target.style.transform = event.transform;
            }
          }}
          onRotateGroupEnd={({ events }) => applyGroupRotateResult(events)}
        />
      ) : null}

      {!isGroupMode &&
      singlePlacement &&
      cropPlacementId === singlePlacement.id &&
      singlePlacement.kind === "fixed" ? (
        <CropEditorOverlay
          targetElement={selectedElements[0]!}
          placement={singlePlacement}
          assetPath={cropAssetPath}
          onCommitCrop={(crop) => {
            onCommit(singlePlacement.id, (placement) => ({
              ...placement,
              crop,
            }));
          }}
          onClose={onCloseCrop}
        />
      ) : null}
    </div>
  );
}
