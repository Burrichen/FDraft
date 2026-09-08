"use client";

import { Gift, TreePine } from "lucide-react";
import {
  setAdjacentCount,
  setClassicCount,
  type ChristmasSplit,
} from "@/domain/drafts/christmas-split";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

// Our Slider wrapper is untyped over single-thumb vs range mode, so
// onValueChange is typed as `number | readonly number[]` even though we
// only ever render a single thumb here.
function toSingleValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? value[0] : (value as number);
}

interface ChristmasLinkedSlidersProps {
  totalFilms: number;
  split: ChristmasSplit;
  onChange: (split: ChristmasSplit) => void;
  /** Advisory per-pool caps from `computeChristmasPoolCapacity` — clamps each slider's max so the UI can't request more than a category actually has (matching `HalloweenLinkedSliders`). The authoritative check still happens at generation time. */
  availability: { classicAvailable: number; adjacentAvailable: number };
}

/**
 * The two-way sibling of `HalloweenLinkedSliders` — two sliders whose
 * values always sum to `totalFilms` (see docs/updates, "FDRAFT UPDATE 1 —
 * CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §4). Same base `Slider` UI
 * primitive (full mouse/keyboard/touch support) and the same "derive the
 * next state from a pure, tested domain function" pattern
 * (`christmas-split.ts`'s setters, themselves adapters over the app's
 * existing two-way split primitives), so an invalid intermediate
 * allocation is structurally impossible here too.
 *
 * Colour roles follow §10's unequal hierarchy. The two slider FILLS stay
 * on the shared `--primary` (snow, inside `.theme-christmas`) exactly like
 * Halloween's three do — painting each track a different saturated colour
 * is precisely the "four colours scattered everywhere" §13 warns against.
 * Category identity comes from the labels instead: Classic, the headline
 * category, carries the festive GREEN badge and Christmas Adjacent the
 * cool WINTER blue one. Both are token-driven
 * (`--christmas-green`/`--christmas-winter`), never literal hex values.
 */
export function ChristmasLinkedSliders({
  totalFilms,
  split,
  onChange,
  availability,
}: ChristmasLinkedSlidersProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="christmas-classic-slider"
            className="flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className="bg-christmas-green/15 text-christmas-green flex size-6 items-center justify-center rounded-full"
            >
              <TreePine className="size-3.5" />
            </span>
            Classic
          </Label>
          <span className="text-muted-foreground text-sm tabular-nums">
            {split.classicCount}
          </span>
        </div>
        <Slider
          id="christmas-classic-slider"
          aria-label="Classic films"
          min={0}
          max={Math.min(totalFilms, availability.classicAvailable)}
          step={1}
          value={split.classicCount}
          onValueChange={(value) =>
            onChange(setClassicCount(totalFilms, toSingleValue(value)))
          }
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="christmas-adjacent-slider"
            className="flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className="bg-christmas-winter/15 text-christmas-winter flex size-6 items-center justify-center rounded-full"
            >
              <Gift className="size-3.5" />
            </span>
            Christmas Adjacent
          </Label>
          <span className="text-muted-foreground text-sm tabular-nums">
            {split.adjacentCount}
          </span>
        </div>
        <Slider
          id="christmas-adjacent-slider"
          aria-label="Christmas Adjacent films"
          min={0}
          max={Math.min(totalFilms, availability.adjacentAvailable)}
          step={1}
          value={split.adjacentCount}
          onValueChange={(value) =>
            onChange(setAdjacentCount(totalFilms, toSingleValue(value)))
          }
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Classic + Christmas Adjacent always adds up to{" "}
        <strong className="text-foreground tabular-nums">{totalFilms}</strong>{" "}
        films.
      </p>
    </div>
  );
}
