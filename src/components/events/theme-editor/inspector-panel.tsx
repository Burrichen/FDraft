"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type {
  AlignAction,
  DistributeAction,
} from "@/domain/event-studio/alignment-ops";
import {
  findGroupContaining,
  type PlacementGroups,
} from "@/domain/event-studio/placement-groups";
import {
  getPlacementsAt,
  type PlacementLocation,
  type PlacementReorderDirection,
} from "@/domain/event-studio/placement-ops";
import { computeVariantPercentages } from "@/domain/event-studio/variant-group-ops";
import {
  FDRAFT_THEME_ANCHORS,
  FDRAFT_THEME_COORDINATE_SPACES,
  type FDraftThemeAnchor,
  type FDraftThemeBreakpointId,
  type FDraftThemeCoordinateSpace,
  type FDraftThemeFile,
  type FDraftThemePlacement,
  type FDraftThemeWeightedVariant,
} from "@/domain/event-themes/fdraft-theme-schema";
import {
  FDRAFT_THEME_INTERACTION_IDS,
  FDRAFT_THEME_INTERACTION_LABELS,
  type FDraftThemeInteractionId,
} from "@/domain/event-themes/theme-interaction-ids";
import type { PlacementUpdater } from "./editable-theme-canvas";

const ANCHOR_LABELS: Record<FDraftThemeAnchor, string> = {
  "top-left": "Top Left",
  "top-center": "Top Center",
  "top-right": "Top Right",
  "left-center": "Left Center",
  center: "Centre",
  "right-center": "Right Center",
  "bottom-left": "Bottom Left",
  "bottom-center": "Bottom Center",
  "bottom-right": "Bottom Right",
};

const POSITIONING_LABELS: Record<FDraftThemeCoordinateSpace, string> = {
  page: "Page",
  viewport: "Viewport",
};

const BREAKPOINT_LABELS: Record<FDraftThemeBreakpointId, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

export interface InspectorPanelProps {
  theme: FDraftThemeFile | null;
  location: PlacementLocation;
  selectedPlacementIds: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  groups: PlacementGroups;
  onGroup: () => void;
  onUngroup: () => void;
  lockedPlacementIds: ReadonlySet<string>;
  onToggleLock: (id: string) => void;
  freeResize: boolean;
  onToggleFreeResize: () => void;
  cropActive: boolean;
  onStartCrop: (id: string) => void;
  interactionTestMode: boolean;
  onToggleInteractionTestMode: () => void;
  onCommit: (placementId: string, updater: PlacementUpdater) => void;
  onRename: (placementId: string, newId: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onReorder: (
    placementId: string,
    direction: PlacementReorderDirection,
  ) => void;
  onToggleVisible: (placementId: string) => void;
  onAlign: (action: AlignAction) => void;
  onDistribute: (action: DistributeAction) => void;
  onConvertToVariantGroup: (placementId: string) => void;
  onStartVariantAssetPick: (placementId: string) => void;
  onAddNothingOption: (placementId: string) => void;
  onRemoveVariantOption: (placementId: string, optionId: string) => void;
  onUpdateVariantOptionWeight: (
    placementId: string,
    optionId: string,
    weight: number,
  ) => void;
  onUpdateVariantOptionAdjustments: (
    placementId: string,
    optionId: string,
    updater: (
      variant: FDraftThemeWeightedVariant,
    ) => FDraftThemeWeightedVariant,
  ) => void;
  onReorderVariantOption: (
    placementId: string,
    optionId: string,
    direction: "up" | "down",
  ) => void;
  previewSeed: string;
  onRerollPreview: () => void;
  onResetPreviewSeed: () => void;
  onCopyToBreakpoint: (targetBreakpointId: FDraftThemeBreakpointId) => void;
  onCopyToAllBreakpoints: () => void;
  safeZoneWarnings: string[];
}

/** A local-draft-then-commit numeric field — every keystroke updates local state only; the value is only written into the theme (and pushed onto undo history) on blur or Enter, so typing a multi-digit number never produces one history entry per digit. */
function NumberField({
  label,
  value,
  step = 0.25,
  onCommit,
}: {
  label: string;
  value: number;
  step?: number;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs the draft when the committed value changes externally (undo/redo, another field's commit), same accepted pattern as `useAsyncData`.
    setDraft(String(Math.round(value * 100) / 100));
  }, [value]);

  function commit() {
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed !== value) {
      onCommit(parsed);
    } else {
      setDraft(String(Math.round(value * 100) / 100));
    }
  }

  return (
    <label className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
      {label}
      <Input
        type="number"
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className="h-6 w-20 text-xs"
      />
    </label>
  );
}

function LayersSection({
  theme,
  location,
  selectedPlacementIds,
  onSelectionChange,
  groups,
  lockedPlacementIds,
  onToggleLock,
  onToggleVisible,
  onRename,
  onReorder,
}: Pick<
  InspectorPanelProps,
  | "theme"
  | "location"
  | "selectedPlacementIds"
  | "onSelectionChange"
  | "groups"
  | "lockedPlacementIds"
  | "onToggleLock"
  | "onToggleVisible"
  | "onRename"
  | "onReorder"
>) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const placements = theme ? getPlacementsAt(theme, location) : [];
  // Layers list reads top-of-z-order first (matches every layer panel
  // convention — the thing painted LAST/on top is listed FIRST), the
  // reverse of the underlying array's own paint order.
  const topDown = [...placements].reverse();
  const singleSelectedId =
    selectedPlacementIds.size === 1
      ? Array.from(selectedPlacementIds)[0]
      : null;

  return (
    <div className="space-y-1.5">
      <h2 className="text-foreground text-sm font-semibold">Layers</h2>
      {!theme ? (
        <p className="text-muted-foreground text-xs">No theme loaded.</p>
      ) : placements.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No placements yet — place an asset from the Asset Browser.
        </p>
      ) : (
        <ul className="space-y-1">
          {topDown.map((placement) => {
            const locked = lockedPlacementIds.has(placement.id);
            const selected = selectedPlacementIds.has(placement.id);
            const grouped = findGroupContaining(groups, placement.id) !== null;
            return (
              <li
                key={placement.id}
                className={`flex items-center gap-1 rounded border px-1.5 py-1 text-xs ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-muted/30"
                }`}
              >
                {renamingId === placement.id ? (
                  <Input
                    autoFocus
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onBlur={() => {
                      if (renameDraft.trim() && renameDraft !== placement.id) {
                        onRename(placement.id, renameDraft.trim());
                      }
                      setRenamingId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    className="h-5 flex-1 text-xs"
                  />
                ) : (
                  <button
                    type="button"
                    className="flex-1 truncate text-left"
                    onClick={(event) => {
                      const next = new Set(selectedPlacementIds);
                      if (event.shiftKey || event.metaKey || event.ctrlKey) {
                        if (next.has(placement.id)) next.delete(placement.id);
                        else next.add(placement.id);
                      } else {
                        next.clear();
                        next.add(placement.id);
                      }
                      onSelectionChange(next);
                    }}
                    onDoubleClick={() => {
                      setRenamingId(placement.id);
                      setRenameDraft(placement.id);
                    }}
                    title="Click to select (Shift/Cmd-click to multiselect), double-click to rename"
                  >
                    {placement.id}
                    {placement.kind === "weighted" ? (
                      <span className="text-muted-foreground ml-1">
                        (variant group)
                      </span>
                    ) : null}
                    {grouped ? (
                      <span className="text-muted-foreground ml-1">
                        (grouped)
                      </span>
                    ) : null}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={
                    placement.visible
                      ? `Hide ${placement.id}`
                      : `Show ${placement.id}`
                  }
                  aria-pressed={!placement.visible}
                  onClick={() => onToggleVisible(placement.id)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  {placement.visible ? "◎" : "◌"}
                </button>
                <button
                  type="button"
                  aria-label={
                    locked ? `Unlock ${placement.id}` : `Lock ${placement.id}`
                  }
                  aria-pressed={locked}
                  onClick={() => onToggleLock(placement.id)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  {locked ? "🔒" : "🔓"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {singleSelectedId ? (
        <div className="flex flex-wrap gap-1 pt-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onReorder(singleSelectedId, "front")}
          >
            Bring to Front
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onReorder(singleSelectedId, "forward")}
          >
            Bring Forward
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onReorder(singleSelectedId, "backward")}
          >
            Send Backward
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onReorder(singleSelectedId, "back")}
          >
            Send to Back
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const ALIGN_BUTTONS: { action: AlignAction; label: string }[] = [
  { action: "left", label: "Align Left" },
  { action: "centerH", label: "Align Centre" },
  { action: "right", label: "Align Right" },
  { action: "top", label: "Align Top" },
  { action: "middleV", label: "Align Middle" },
  { action: "bottom", label: "Align Bottom" },
];

/** Shown instead of the single-object Inspector whenever 2+ placements are selected (see docs/updates, "EVENT STUDIO — PHASE 5" §6/§9) — deliberately NOT an attempt at multi-object field editing (no shared X/Y/rotation inputs); align/distribute/group ARE the multiselect editing model here. */
function MultiSelectToolbar({
  count,
  isFullyGrouped,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
  onDelete,
  onDuplicate,
  onCopyToBreakpoint,
  onCopyToAllBreakpoints,
}: {
  count: number;
  isFullyGrouped: boolean;
  onAlign: (action: AlignAction) => void;
  onDistribute: (action: DistributeAction) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopyToBreakpoint: (targetBreakpointId: FDraftThemeBreakpointId) => void;
  onCopyToAllBreakpoints: () => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-foreground text-sm font-semibold">
        {count} objects selected
      </h2>

      <div>
        <p className="text-muted-foreground mb-1 text-xs font-medium">Align</p>
        <div className="grid grid-cols-3 gap-1">
          {ALIGN_BUTTONS.map(({ action, label }) => (
            <Button
              key={action}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onAlign(action)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-muted-foreground mb-1 text-xs font-medium">
          Distribute
        </p>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={count < 3}
            onClick={() => onDistribute("horizontal")}
          >
            Distribute Horizontally
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={count < 3}
            onClick={() => onDistribute("vertical")}
          >
            Distribute Vertically
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="outline" size="xs" onClick={onGroup}>
          Group
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!isFullyGrouped}
          onClick={onUngroup}
        >
          Ungroup
        </Button>
      </div>

      <div className="border-border space-y-1 border-t pt-2">
        <p className="text-muted-foreground text-xs font-medium">
          Copy group to breakpoint
        </p>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onCopyToBreakpoint("tablet")}
          >
            Copy to Tablet
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onCopyToBreakpoint("mobile")}
          >
            Copy to Mobile
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onCopyToAllBreakpoints}
          >
            Copy to All Breakpoints
          </Button>
        </div>
      </div>

      <div className="border-border flex flex-wrap gap-1 border-t pt-2">
        <Button type="button" variant="outline" size="xs" onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="xs"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

function VariantEditorSection({
  placement,
  onStartVariantAssetPick,
  onAddNothingOption,
  onRemoveVariantOption,
  onUpdateVariantOptionWeight,
  onUpdateVariantOptionAdjustments,
  onReorderVariantOption,
  previewSeed,
  onRerollPreview,
  onResetPreviewSeed,
}: {
  placement: Extract<FDraftThemePlacement, { kind: "weighted" }>;
  onStartVariantAssetPick: () => void;
  onAddNothingOption: () => void;
  onRemoveVariantOption: (optionId: string) => void;
  onUpdateVariantOptionWeight: (optionId: string, weight: number) => void;
  onUpdateVariantOptionAdjustments: (
    optionId: string,
    updater: (
      variant: FDraftThemeWeightedVariant,
    ) => FDraftThemeWeightedVariant,
  ) => void;
  onReorderVariantOption: (optionId: string, direction: "up" | "down") => void;
  previewSeed: string;
  onRerollPreview: () => void;
  onResetPreviewSeed: () => void;
}) {
  const [expandedOptionId, setExpandedOptionId] = useState<string | null>(null);
  const percentages = computeVariantPercentages(placement.variants);
  const percentageById = new Map(
    percentages.map((p) => [p.optionId, p.percentage]),
  );

  return (
    <div className="border-border space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-foreground text-sm font-semibold">
          Variant options
        </h3>
        <span className="text-muted-foreground text-[0.65rem]">
          {previewSeed.slice(0, 8)}
        </span>
      </div>

      <ul className="space-y-1.5">
        {placement.variants.map((variant) => (
          <li
            key={variant.id}
            className="border-border bg-muted/30 space-y-1 rounded border px-2 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">
                {variant.assetId ?? "Nothing"}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {percentageById.get(variant.id) ?? 0}%
              </span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={0}
                max={100}
                value={variant.weight}
                onChange={(event) =>
                  onUpdateVariantOptionWeight(
                    variant.id,
                    Number(event.target.value),
                  )
                }
                className="h-4 flex-1"
                aria-label={`Weight for ${variant.assetId ?? "Nothing"}`}
              />
              <button
                type="button"
                aria-label={`Move ${variant.assetId ?? "Nothing"} up`}
                onClick={() => onReorderVariantOption(variant.id, "up")}
                className="text-muted-foreground hover:text-foreground"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${variant.assetId ?? "Nothing"} down`}
                onClick={() => onReorderVariantOption(variant.id, "down")}
                className="text-muted-foreground hover:text-foreground"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`Remove ${variant.assetId ?? "Nothing"}`}
                onClick={() => onRemoveVariantOption(variant.id)}
                className="text-destructive"
                disabled={placement.variants.length <= 1}
              >
                ✕
              </button>
              <button
                type="button"
                aria-label={`Fine-tune ${variant.assetId ?? "Nothing"}`}
                aria-expanded={expandedOptionId === variant.id}
                onClick={() =>
                  setExpandedOptionId((current) =>
                    current === variant.id ? null : variant.id,
                  )
                }
                className="text-muted-foreground hover:text-foreground"
              >
                ⚙
              </button>
            </div>

            {expandedOptionId === variant.id ? (
              <div className="border-border grid grid-cols-2 gap-x-2 gap-y-1 border-t pt-1.5">
                <NumberField
                  label="Scale ×"
                  value={variant.scale ?? 1}
                  step={0.05}
                  onCommit={(next) =>
                    onUpdateVariantOptionAdjustments(variant.id, (v) => ({
                      ...v,
                      scale: next,
                    }))
                  }
                />
                <NumberField
                  label="Rotation +"
                  value={variant.rotationAdjustment}
                  step={1}
                  onCommit={(next) =>
                    onUpdateVariantOptionAdjustments(variant.id, (v) => ({
                      ...v,
                      rotationAdjustment: next,
                    }))
                  }
                />
                <NumberField
                  label="Offset X +"
                  value={variant.offsetXAdjustment}
                  step={0.25}
                  onCommit={(next) =>
                    onUpdateVariantOptionAdjustments(variant.id, (v) => ({
                      ...v,
                      offsetXAdjustment: next,
                    }))
                  }
                />
                <NumberField
                  label="Offset Y +"
                  value={variant.offsetYAdjustment}
                  step={0.25}
                  onCommit={(next) =>
                    onUpdateVariantOptionAdjustments(variant.id, (v) => ({
                      ...v,
                      offsetYAdjustment: next,
                    }))
                  }
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onStartVariantAssetPick}
        >
          + Add asset option
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onAddNothingOption}
        >
          + Add Nothing
        </Button>
      </div>

      <div className="border-border flex flex-wrap items-center gap-1 border-t pt-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onRerollPreview}
        >
          Preview Another Variant
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onResetPreviewSeed}
        >
          Reset Preview Seed
        </Button>
      </div>
      <p className="text-muted-foreground text-[0.65rem]">
        Rerolling only changes what THIS editor previews — production stays
        session-deterministic, unaffected.
      </p>
    </div>
  );
}

function InspectorFieldsSection(props: InspectorPanelProps) {
  const {
    theme,
    location,
    selectedPlacementIds,
    lockedPlacementIds,
    freeResize,
    onToggleFreeResize,
    cropActive,
    onStartCrop,
    interactionTestMode,
    onToggleInteractionTestMode,
    onCommit,
    onDelete,
    onDuplicate,
    onConvertToVariantGroup,
    onStartVariantAssetPick,
    onAddNothingOption,
    onRemoveVariantOption,
    onUpdateVariantOptionWeight,
    onUpdateVariantOptionAdjustments,
    onReorderVariantOption,
    previewSeed,
    onRerollPreview,
    onResetPreviewSeed,
    onCopyToBreakpoint,
    onCopyToAllBreakpoints,
    safeZoneWarnings,
  } = props;

  const selectedId =
    selectedPlacementIds.size === 1
      ? Array.from(selectedPlacementIds)[0]
      : null;
  const placement =
    theme && selectedId
      ? (getPlacementsAt(theme, location).find((p) => p.id === selectedId) ??
        null)
      : null;

  if (!selectedId || !placement) {
    return (
      <p className="text-muted-foreground text-xs">
        Select a placement to edit its properties.
      </p>
    );
  }

  const locked = lockedPlacementIds.has(placement.id);
  const commit = (updater: PlacementUpdater) => onCommit(placement.id, updater);
  const applyToShared = (
    fn: (p: FDraftThemePlacement) => Partial<FDraftThemePlacement>,
  ) =>
    commit(
      (current) => ({ ...current, ...fn(current) }) as FDraftThemePlacement,
    );

  const height =
    placement.height ??
    (placement.width !== null && placement.aspectRatio !== null
      ? placement.width / placement.aspectRatio
      : (placement.width ?? 0));

  const responsiveVisibility: Record<FDraftThemeBreakpointId, boolean> | null =
    theme
      ? (["desktop", "tablet", "mobile"] as const).reduce(
          (acc, bp) => {
            const found = getPlacementsAt(theme, {
              ...location,
              breakpointId: bp,
            }).find((p) => p.id === placement.id);
            acc[bp] = Boolean(found?.visible);
            return acc;
          },
          {} as Record<FDraftThemeBreakpointId, boolean>,
        )
      : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-foreground text-sm font-semibold">Inspector</h2>
        {locked ? (
          <span className="text-muted-foreground text-[0.65rem]">
            Locked — unlock to edit
          </span>
        ) : null}
      </div>

      {safeZoneWarnings.length > 0 ? (
        <div className="space-y-0.5 rounded border border-amber-400/50 bg-amber-400/10 px-2 py-1.5">
          {safeZoneWarnings.map((warning) => (
            <p key={warning} className="text-[0.7rem] text-amber-700">
              ⚠ {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div
        className={`space-y-1.5 ${locked ? "pointer-events-none opacity-50" : ""}`}
      >
        <NumberField
          label="X offset (rem)"
          value={placement.offsetX}
          onCommit={(next) => applyToShared(() => ({ offsetX: next }))}
        />
        <NumberField
          label="Y offset (rem)"
          value={placement.offsetY}
          onCommit={(next) => applyToShared(() => ({ offsetY: next }))}
        />
        <NumberField
          label="Width (rem)"
          value={placement.width ?? 0}
          step={0.5}
          onCommit={(next) =>
            applyToShared(() => ({
              width: Math.max(0.1, next),
              height: freeResize ? placement.height : null,
            }))
          }
        />
        <NumberField
          label="Height (rem)"
          value={height}
          step={0.5}
          onCommit={(next) =>
            applyToShared(() => ({ height: Math.max(0.1, next) }))
          }
        />
        <label className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          Free resize
          <input
            type="checkbox"
            checked={freeResize}
            onChange={onToggleFreeResize}
          />
        </label>
        <NumberField
          label="Rotation (deg)"
          value={placement.rotation}
          step={1}
          onCommit={(next) => applyToShared(() => ({ rotation: next }))}
        />

        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">Opacity</span>
          <div className="w-24">
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={placement.opacity}
              onValueCommitted={(next) =>
                applyToShared(() => ({
                  opacity: Array.isArray(next) ? next[0] : next,
                }))
              }
            />
          </div>
        </div>

        <label className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          Anchor
          <select
            className="border-border bg-background text-foreground rounded border px-1 py-0.5 text-xs"
            value={placement.anchor}
            onChange={(event) =>
              applyToShared(() => ({
                anchor: event.target.value as FDraftThemeAnchor,
              }))
            }
          >
            {FDRAFT_THEME_ANCHORS.map((anchor) => (
              <option key={anchor} value={anchor}>
                {ANCHOR_LABELS[anchor]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          Positioning
          <select
            className="border-border bg-background text-foreground rounded border px-1 py-0.5 text-xs"
            value={placement.coordinateSpace}
            onChange={(event) =>
              applyToShared(() => ({
                coordinateSpace: event.target
                  .value as FDraftThemeCoordinateSpace,
              }))
            }
          >
            {FDRAFT_THEME_COORDINATE_SPACES.map((space) => (
              <option key={space} value={space}>
                {POSITIONING_LABELS[space]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          Interaction
          <select
            className="border-border bg-background text-foreground rounded border px-1 py-0.5 text-xs"
            value={placement.interactionId ?? ""}
            onChange={(event) =>
              applyToShared(() => ({
                interactionId: event.target.value
                  ? (event.target.value as FDraftThemeInteractionId)
                  : null,
              }))
            }
          >
            <option value="">None</option>
            {FDRAFT_THEME_INTERACTION_IDS.map((id) => (
              <option key={id} value={id}>
                {FDRAFT_THEME_INTERACTION_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        {placement.interactionId ? (
          <label className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
            Test interaction on canvas
            <input
              type="checkbox"
              checked={interactionTestMode}
              onChange={onToggleInteractionTestMode}
            />
          </label>
        ) : null}

        <div className="flex flex-wrap gap-1 pt-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => applyToShared((p) => ({ flipX: !p.flipX }))}
          >
            Flip Horizontal
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => applyToShared((p) => ({ flipY: !p.flipY }))}
          >
            Flip Vertical
          </Button>
        </div>

        {placement.kind === "fixed" ? (
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant={cropActive ? "secondary" : "outline"}
              size="xs"
              disabled={!placement.assetId}
              onClick={() => onStartCrop(placement.id)}
            >
              Crop
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={!placement.crop}
              onClick={() => applyToShared(() => ({ crop: null }))}
            >
              Reset Crop
            </Button>
          </div>
        ) : null}
      </div>

      {placement.kind === "fixed" ? (
        <div className="border-border border-t pt-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onConvertToVariantGroup(placement.id)}
          >
            Convert to Variant Group
          </Button>
        </div>
      ) : (
        <VariantEditorSection
          placement={placement}
          onStartVariantAssetPick={() => onStartVariantAssetPick(placement.id)}
          onAddNothingOption={() => onAddNothingOption(placement.id)}
          onRemoveVariantOption={(optionId) =>
            onRemoveVariantOption(placement.id, optionId)
          }
          onUpdateVariantOptionWeight={(optionId, weight) =>
            onUpdateVariantOptionWeight(placement.id, optionId, weight)
          }
          onUpdateVariantOptionAdjustments={(optionId, updater) =>
            onUpdateVariantOptionAdjustments(placement.id, optionId, updater)
          }
          onReorderVariantOption={(optionId, direction) =>
            onReorderVariantOption(placement.id, optionId, direction)
          }
          previewSeed={previewSeed}
          onRerollPreview={onRerollPreview}
          onResetPreviewSeed={onResetPreviewSeed}
        />
      )}

      {responsiveVisibility ? (
        <div className="border-border space-y-1.5 border-t pt-2">
          <p className="text-muted-foreground text-xs font-medium">
            Visible on
          </p>
          <div className="flex flex-wrap gap-1">
            {(["desktop", "tablet", "mobile"] as const).map((bp) => (
              <span
                key={bp}
                className={`rounded px-1.5 py-0.5 text-[0.65rem] ${
                  responsiveVisibility[bp]
                    ? "bg-emerald-500/20 text-emerald-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {BREAKPOINT_LABELS[bp]} {responsiveVisibility[bp] ? "✓" : "—"}
              </span>
            ))}
          </div>
          <p className="text-muted-foreground text-xs font-medium">
            Copy to breakpoint
          </p>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onCopyToBreakpoint("tablet")}
            >
              Copy to Tablet
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onCopyToBreakpoint("mobile")}
            >
              Copy to Mobile
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onCopyToAllBreakpoints}
            >
              Copy to All Breakpoints
            </Button>
          </div>
        </div>
      ) : null}

      <div className="border-border flex flex-wrap gap-1 border-t pt-2">
        <Button type="button" variant="outline" size="xs" onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="xs"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

/**
 * The Studio editor's right sidebar (see docs/updates, "EVENT STUDIO —
 * PHASE 4" §7/§8/§9, "EVENT STUDIO — PHASE 5" §1–§3/§6/§9–§12) — Layers
 * on top (now multiselect-aware), then either the single-object Inspector
 * (fields + Variant Editor when applicable) or the multiselect toolbar
 * (Align/Distribute/Group/Ungroup), depending on how many placements are
 * currently selected.
 */
export function InspectorPanel(props: InspectorPanelProps) {
  const {
    selectedPlacementIds,
    groups,
    onGroup,
    onUngroup,
    onAlign,
    onDistribute,
    onDelete,
    onDuplicate,
  } = props;
  const count = selectedPlacementIds.size;
  const selectedArray = Array.from(selectedPlacementIds);
  const isFullyGrouped =
    count >= 2 &&
    selectedArray.every((id) => findGroupContaining(groups, id) !== null) &&
    new Set(
      selectedArray.map((id) => findGroupContaining(groups, id)?.join(",")),
    ).size === 1;

  return (
    <div className="border-border bg-card w-64 shrink-0 space-y-4 overflow-y-auto rounded-lg border p-3">
      <LayersSection {...props} />
      <div className="border-border border-t pt-3">
        {count >= 2 ? (
          <MultiSelectToolbar
            count={count}
            isFullyGrouped={isFullyGrouped}
            onAlign={onAlign}
            onDistribute={onDistribute}
            onGroup={onGroup}
            onUngroup={onUngroup}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onCopyToBreakpoint={props.onCopyToBreakpoint}
            onCopyToAllBreakpoints={props.onCopyToAllBreakpoints}
          />
        ) : (
          <InspectorFieldsSection {...props} />
        )}
      </div>
    </div>
  );
}
