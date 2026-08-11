import type { DraftTimeMode } from "@/repositories";
import { cn } from "@/lib/utils";

interface TimeModeToggleProps {
  value: DraftTimeMode;
  onChange: (mode: DraftTimeMode) => void;
}

const OPTIONS: { id: DraftTimeMode; label: string; description: string }[] = [
  {
    id: "calendar",
    label: "Calendar",
    description: "Ends at the end of this calendar month.",
  },
  {
    id: "timer",
    label: "Timer",
    description: "Ends exactly 30 days from now.",
  },
];

/**
 * See docs/product-spec.md, "Draft Time Mode" — this toggle only ever
 * appears during draft creation; the resulting deadline is computed
 * server-side and persisted, never recalculated from here.
 */
export function TimeModeToggle({ value, onChange }: TimeModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Time mode"
      className="grid grid-cols-2 gap-3"
    >
      {OPTIONS.map((option) => {
        const isSelected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.id)}
            className={cn(
              "focus-visible:outline-ring rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
              isSelected
                ? "border-primary bg-secondary"
                : "border-border bg-card hover:border-primary/50",
            )}
          >
            <p className="text-foreground text-sm font-semibold">
              {option.label}
            </p>
            <p className="text-muted-foreground text-xs">
              {option.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
