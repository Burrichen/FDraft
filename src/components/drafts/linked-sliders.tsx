"use client";

import {
  setChallengeCount,
  setRandomCount,
  type DraftSplit,
} from "@/domain/drafts/split";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

// Our Slider wrapper is untyped over single-thumb vs range mode, so
// onValueChange is typed as `number | readonly number[]` even though we
// only ever render a single thumb here.
function toSingleValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? value[0] : (value as number);
}

interface LinkedSlidersProps {
  totalFilms: number;
  split: DraftSplit;
  onChange: (split: DraftSplit) => void;
}

/**
 * See docs/product-spec.md, "Draft Configuration — Random vs Challenge":
 * two linked sliders whose values always sum to `totalFilms`. Both derive
 * their next state from the pure, tested `setRandomCount`/`setChallengeCount`
 * functions (src/domain/drafts/split.ts), so an invalid intermediate split
 * is structurally impossible — there's no state the sliders could reach
 * where random + challenge don't add up.
 */
export function LinkedSliders({
  totalFilms,
  split,
  onChange,
}: LinkedSlidersProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="random-films-slider">Random films</Label>
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {split.randomCount}
          </span>
        </div>
        <Slider
          id="random-films-slider"
          aria-label="Random films"
          value={split.randomCount}
          onValueChange={(value) =>
            onChange(setRandomCount(totalFilms, toSingleValue(value)))
          }
          min={0}
          max={totalFilms}
          step={1}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="challenge-films-slider">Challenge films</Label>
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {split.challengeCount}
          </span>
        </div>
        <Slider
          id="challenge-films-slider"
          aria-label="Challenge films"
          value={split.challengeCount}
          onValueChange={(value) =>
            onChange(setChallengeCount(totalFilms, toSingleValue(value)))
          }
          min={0}
          max={totalFilms}
          step={1}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {split.randomCount} random + {split.challengeCount} challenge ={" "}
        {totalFilms} films
      </p>
    </div>
  );
}
