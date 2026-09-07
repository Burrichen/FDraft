import { DIFFICULTIES, isOneAtATime } from "@/domain/drafts/difficulty";
import type { DraftDifficulty } from "@/repositories";
import { cn } from "@/lib/utils";

const HALLOWEEN_DIFFICULTY_ORDER: Exclude<DraftDifficulty, "freeform">[] = [
  "baby",
  "easy",
  "medium",
  "hard",
  "hardcore",
  // See docs/updates, "FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING" §1 —
  // added alongside the existing numeric difficulties, same convention the
  // normal `/drafts/new` picker already uses.
  "one-at-a-time",
];

interface HalloweenDifficultyPickerProps {
  selected: Exclude<DraftDifficulty, "freeform"> | null;
  onSelect: (id: Exclude<DraftDifficulty, "freeform">) => void;
}

/**
 * The `DifficultyPicker` sibling for Halloween — same central `DIFFICULTIES`
 * config, no duplicate counts (see docs/updates, "PROMPT 19 — HALLOWEEN
 * DRAFT MECHANICS" §1: "Reuse existing domain configuration"), but
 * deliberately excludes Freeform (Halloween has no Freeform mode) and
 * doesn't gate on raw watchlist size — Halloween's three pools have their
 * own, separately-displayed availability (see `HalloweenLinkedSliders`).
 */
export function HalloweenDifficultyPicker({
  selected,
  onSelect,
}: HalloweenDifficultyPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {HALLOWEEN_DIFFICULTY_ORDER.map((id) => {
        const definition = DIFFICULTIES[id];
        const isSelected = selected === id;

        return (
          <button
            key={id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(id)}
            className={cn(
              "focus-visible:outline-ring rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
              isSelected
                ? "border-primary bg-secondary"
                : "border-border bg-card hover:border-primary/50",
            )}
          >
            <p className="text-foreground text-sm font-semibold">
              {definition.label}
            </p>
            <p className="text-muted-foreground text-xs">
              {isOneAtATime(id)
                ? "Build your Draft one film at a time."
                : `${definition.filmCount} films`}
            </p>
          </button>
        );
      })}
    </div>
  );
}
