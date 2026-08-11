import { DIFFICULTIES, DIFFICULTY_ORDER } from "@/domain/drafts/difficulty";
import type { DraftDifficulty } from "@/repositories";
import { cn } from "@/lib/utils";

interface DifficultyPickerProps {
  selected: DraftDifficulty | null;
  onSelect: (id: DraftDifficulty) => void;
  activeWatchlistCount: number;
}

/**
 * See docs/product-spec.md, "Monthly Watchlist Drafts" — difficulty counts
 * read entirely from the central `DIFFICULTIES` config, never duplicated
 * here. A difficulty is disabled (not silently allowed to fail later) when
 * the user doesn't have enough active watchlist films for it — see
 * docs/product-spec.md edge cases: "fewer watchlist films than difficulty
 * requires".
 */
export function DifficultyPicker({
  selected,
  onSelect,
  activeWatchlistCount,
}: DifficultyPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {DIFFICULTY_ORDER.map((id) => {
        const definition = DIFFICULTIES[id];
        const required = definition.filmCount ?? 1;
        const disabled = activeWatchlistCount < required;
        const isSelected = selected === id;

        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-pressed={isSelected}
            onClick={() => onSelect(id)}
            className={cn(
              "focus-visible:outline-ring rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
              isSelected
                ? "border-primary bg-secondary"
                : "border-border bg-card hover:border-primary/50",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <p className="text-foreground text-sm font-semibold">
              {definition.label}
            </p>
            <p className="text-muted-foreground text-xs">
              {definition.filmCount !== null
                ? `${definition.filmCount} films`
                : "Batches of 5"}
            </p>
            {disabled ? (
              <p className="text-destructive mt-1 text-xs">
                Needs {required} active film{required === 1 ? "" : "s"} (
                {activeWatchlistCount} available)
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
