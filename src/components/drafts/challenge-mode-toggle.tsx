import type { DraftChallengeMode } from "@/repositories";
import { cn } from "@/lib/utils";

interface ChallengeModeToggleProps {
  value: DraftChallengeMode;
  onChange: (mode: DraftChallengeMode) => void;
}

const OPTIONS: {
  id: DraftChallengeMode;
  label: string;
  description: string;
}[] = [
  {
    id: "decide",
    label: "Decide My Challenge For Me",
    description: "Randomly picked from the eligible catalogue.",
  },
  {
    id: "choose",
    label: "Choose My Challenge",
    description: "Search and pick your own challenges.",
  },
];

/** See docs/product-spec.md, "Draft Configuration — Random vs Challenge" — only shown once at least one challenge slot exists. */
export function ChallengeModeToggle({
  value,
  onChange,
}: ChallengeModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Challenge mode"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
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
