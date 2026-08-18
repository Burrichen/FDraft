import { cn } from "@/lib/utils";

export type DraftSource = "random" | "diy";

const OPTIONS: { id: DraftSource; label: string; description: string }[] = [
  {
    id: "random",
    label: "Roll My Draft For Me",
    description: "FDraft picks films from your watchlist for you.",
  },
  {
    id: "diy",
    label: "Build My Own Draft",
    description: "Choose every film yourself from your watchlist.",
  },
];

/** See docs/updates, v1.1.0, "NEW DRAFTING MODE — DIY DRAFT" — mirrors `ChallengeModeToggle`'s segmented-control pattern. */
export function DraftSourceToggle({
  value,
  onChange,
}: {
  value: DraftSource;
  onChange: (source: DraftSource) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="How to build this draft"
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
