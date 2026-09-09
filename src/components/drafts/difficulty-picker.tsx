import {
  CREATABLE_DIFFICULTY_ORDER,
  DIFFICULTIES,
} from "@/domain/drafts/difficulty";
import type { DraftDifficulty } from "@/repositories";
import { cn } from "@/lib/utils";

interface DifficultyPickerProps {
  selected: DraftDifficulty | null;
  onSelect: (id: DraftDifficulty) => void;
  activeWatchlistCount: number;
  /**
   * Difficulties this particular entry point can't offer, mapped to the
   * reason shown in place of the usual film count — rendered exactly like
   * the "not enough films" case below, rather than as a second visual
   * language for "unavailable". Omitted (the default) leaves every
   * creatable difficulty selectable, unchanged.
   */
  unavailableDifficulties?: Partial<Record<DraftDifficulty, string>>;
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
  unavailableDifficulties,
}: DifficultyPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {CREATABLE_DIFFICULTY_ORDER.map((id) => {
        const definition = DIFFICULTIES[id];
        const required = definition.filmCount ?? 1;
        const unavailableReason = unavailableDifficulties?.[id] ?? null;
        const notEnoughFilms = activeWatchlistCount < required;
        const disabled = notEnoughFilms || unavailableReason !== null;
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
                : "Build your Draft one film at a time."}
            </p>
            {notEnoughFilms ? (
              <p className="text-destructive mt-1 text-xs">
                Needs {required} active film{required === 1 ? "" : "s"} (
                {activeWatchlistCount} available)
              </p>
            ) : unavailableReason ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {unavailableReason}
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
