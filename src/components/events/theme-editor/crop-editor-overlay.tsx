"use client";

import { useRef, useState } from "react";
import { EventArtImage } from "../event-art-image";
import { Button } from "@/components/ui/button";
import type {
  FDraftThemeCropRect,
  FDraftThemePlacement,
} from "@/domain/event-themes/fdraft-theme-schema";

const FULL_FRAME: FDraftThemeCropRect = { x: 0, y: 0, width: 1, height: 1 };
const MIN_FRACTION = 0.05;
const STAGE_WIDTH_PX = 420;
const STAGE_HEIGHT_PX = 320;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keeps a crop rect inside the [0,1] frame with a sane minimum size — applied after every drag so a handle can never invert or escape the source image's bounds. */
function normalizeCrop(crop: FDraftThemeCropRect): FDraftThemeCropRect {
  const width = clamp(crop.width, MIN_FRACTION, 1);
  const height = clamp(crop.height, MIN_FRACTION, 1);
  const x = clamp(crop.x, 0, 1 - width);
  const y = clamp(crop.y, 0, 1 - height);
  return { x, y, width, height };
}

type HandleId =
  "top-left" | "top-right" | "bottom-left" | "bottom-right" | "move";

export interface CropEditorOverlayProps {
  /** Kept for API symmetry with the canvas's other overlays — not directly used (the crop stage is a fixed-size floating panel, not tied to the target's own on-screen box; see this file's own doc comment for why). */
  targetElement: HTMLElement;
  placement: Extract<FDraftThemePlacement, { kind: "fixed" }>;
  assetPath: string | null;
  onCommitCrop: (crop: FDraftThemeCropRect | null) => void;
  onClose: () => void;
}

/**
 * Non-destructive crop editing (see docs/updates, "EVENT STUDIO — PHASE
 * 4" §6) — a small, purpose-built floating panel, not a Moveable target:
 * unlike move/resize/rotate (genuinely general 2D transform geometry,
 * where a maintained library earns its keep), a crop rect is a single
 * bounded box within a fixed [0,1] frame — plain pointer-event math is
 * simpler and more transparent here than bending a general transform
 * library to a purpose it isn't really for (see §5's own "before
 * hand-rolling... consider a library," read the other way: this IS the
 * "trivial enough to hand-roll" case).
 *
 * A dedicated floating stage (not in-place over the placement's own
 * on-screen box) shows the FULL, uncropped source image — cropping
 * in-place would only ever show the ALREADY-cropped frame, with nothing
 * to expand back into. The crop rect's position/size as a fraction of
 * this stage maps 1:1 onto the normalized `{x,y,width,height}` crop
 * model (§6: "It must export into the `.fdraft-theme` crop model created
 * in Phase 1") — no separate pixel math needed at all.
 */
export function CropEditorOverlay({
  placement,
  assetPath,
  onCommitCrop,
  onClose,
}: CropEditorOverlayProps) {
  const [crop, setCrop] = useState<FDraftThemeCropRect>(
    placement.crop ?? FULL_FRAME,
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: HandleId;
    startCrop: FDraftThemeCropRect;
    startX: number;
    startY: number;
  } | null>(null);

  function handlePointerDown(handle: HandleId, event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragRef.current = {
      handle,
      startCrop: crop,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || !stageRef.current) return;
    const stageRect = stageRef.current.getBoundingClientRect();
    const dx = (event.clientX - drag.startX) / stageRect.width;
    const dy = (event.clientY - drag.startY) / stageRect.height;
    const start = drag.startCrop;

    let next: FDraftThemeCropRect;
    switch (drag.handle) {
      case "move":
        next = { ...start, x: start.x + dx, y: start.y + dy };
        break;
      case "top-left":
        next = {
          x: start.x + dx,
          y: start.y + dy,
          width: start.width - dx,
          height: start.height - dy,
        };
        break;
      case "top-right":
        next = {
          x: start.x,
          y: start.y + dy,
          width: start.width + dx,
          height: start.height - dy,
        };
        break;
      case "bottom-left":
        next = {
          x: start.x + dx,
          y: start.y,
          width: start.width - dx,
          height: start.height + dy,
        };
        break;
      case "bottom-right":
        next = {
          x: start.x,
          y: start.y,
          width: start.width + dx,
          height: start.height + dy,
        };
        break;
    }
    setCrop(normalizeCrop(next));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  const isFullFrame =
    crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;

  return (
    <div className="bg-card/98 border-border absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 border p-4 backdrop-blur-sm">
      <p className="text-foreground text-sm font-medium">Crop</p>
      <div
        ref={stageRef}
        className="border-border relative overflow-hidden border bg-black/80"
        style={{ width: STAGE_WIDTH_PX, height: STAGE_HEIGHT_PX }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {assetPath ? (
          <EventArtImage
            src={assetPath}
            className="pointer-events-none absolute inset-0 size-full object-fill"
          />
        ) : null}
        <div
          role="group"
          aria-label="Crop region"
          className="absolute cursor-move border-2 border-white"
          style={{
            left: `${crop.x * 100}%`,
            top: `${crop.y * 100}%`,
            width: `${crop.width * 100}%`,
            height: `${crop.height * 100}%`,
          }}
          onPointerDown={(event) => handlePointerDown("move", event)}
        >
          {(
            [
              ["top-left", "-top-1.5 -left-1.5 cursor-nwse-resize"],
              ["top-right", "-top-1.5 -right-1.5 cursor-nesw-resize"],
              ["bottom-left", "-bottom-1.5 -left-1.5 cursor-nesw-resize"],
              ["bottom-right", "-bottom-1.5 -right-1.5 cursor-nwse-resize"],
            ] as const
          ).map(([handle, positionClass]) => (
            <div
              key={handle}
              role="button"
              aria-label={`Resize crop — ${handle.replace("-", " ")}`}
              tabIndex={0}
              className={`absolute size-3 rounded-full border border-white bg-indigo-500 ${positionClass}`}
              onPointerDown={(event) => handlePointerDown(handle, event)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isFullFrame}
          onClick={() => setCrop(FULL_FRAME)}
        >
          Reset Crop
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onCommitCrop(isFullFrame ? null : crop);
            onClose();
          }}
        >
          Apply Crop
        </Button>
      </div>
    </div>
  );
}
