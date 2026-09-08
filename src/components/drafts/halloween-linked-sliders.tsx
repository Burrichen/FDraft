"use client";

import {
  setHorrorCount,
  setKitschCount,
  type HalloweenSplit,
} from "@/domain/drafts/halloween-split";
import {
  HalloweenBat,
  HalloweenCandy,
} from "@/components/events/halloween-decorations";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

// Our Slider wrapper is untyped over single-thumb vs range mode, so
// onValueChange is typed as `number | readonly number[]` even though we
// only ever render a single thumb here.
function toSingleValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? value[0] : (value as number);
}

interface HalloweenLinkedSlidersProps {
  totalFilms: number;
  split: HalloweenSplit;
  onChange: (split: HalloweenSplit) => void;
  /** Advisory per-pool caps from `computeHalloweenPoolCapacity` — clamps each slider's max so the UI can't request more than a pool actually has available. The real, authoritative check still happens at generation time. */
  availability: {
    horrorAvailable: number;
    kitschAvailable: number;
  };
}

/**
 * The two-way sibling of `ChristmasLinkedSliders` — two sliders whose
 * values always sum to `totalFilms` (see docs/updates, "FDRAFT UPDATE 1 —
 * EVENT WATCHLIST PREFERENCE CLEANUP" §1/§2). Halloween-adjacent, the
 * third slider this used to also render, is gone — Halloween now uses
 * only its two purely-curated categories, exactly like Christmas's own
 * two. Same base `Slider` UI primitive (full mouse/keyboard/touch
 * support), same "derive the next state from a pure, tested domain
 * function" pattern (`halloween-split.ts`'s setters), so an invalid
 * intermediate allocation is structurally impossible here too.
 */
export function HalloweenLinkedSliders({
  totalFilms,
  split,
  onChange,
  availability,
}: HalloweenLinkedSlidersProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="horror-slider" className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="bg-halloween-purple/20 text-halloween-purple flex size-6 items-center justify-center rounded-full"
            >
              <HalloweenBat className="text-halloween-purple size-3.5" />
            </span>
            Horror
          </Label>
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {split.horrorCount}
          </span>
        </div>
        <Slider
          id="horror-slider"
          aria-label="Horror films"
          value={split.horrorCount}
          onValueChange={(value) =>
            onChange(setHorrorCount(totalFilms, toSingleValue(value)))
          }
          min={0}
          max={Math.min(totalFilms, availability.horrorAvailable)}
          step={1}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="kitsch-slider" className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="bg-halloween-cream/20 text-halloween-cream-foreground flex size-6 items-center justify-center rounded-full"
            >
              <HalloweenCandy className="text-halloween-cream-foreground size-3.5" />
            </span>
            Kitsch
          </Label>
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {split.kitschCount}
          </span>
        </div>
        <Slider
          id="kitsch-slider"
          aria-label="Kitsch films"
          value={split.kitschCount}
          onValueChange={(value) =>
            onChange(setKitschCount(totalFilms, toSingleValue(value)))
          }
          min={0}
          max={Math.min(totalFilms, availability.kitschAvailable)}
          step={1}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        Horror + Kitsch always adds up to{" "}
        <strong className="text-foreground tabular-nums">{totalFilms}</strong>{" "}
        films.
      </p>
      <p className="text-foreground flex items-center justify-between border-t pt-3 text-sm font-bold tracking-wide uppercase">
        <span>Total</span>
        <span className="tabular-nums">
          {split.horrorCount + split.kitschCount} / {totalFilms}
        </span>
      </p>
    </div>
  );
}
