import { Shuffle, Sparkles, Trophy } from "lucide-react";

interface SourceOption {
  id: "random" | "manual" | "challenge";
  label: string;
  description: string;
  icon: typeof Shuffle;
}

const OPTIONS: SourceOption[] = [
  {
    id: "random",
    label: "Random",
    description: "Let FDraft choose from your eligible watchlist.",
    icon: Shuffle,
  },
  {
    id: "manual",
    label: "Choose My Own",
    description: "Pick exactly what you want to add.",
    icon: Sparkles,
  },
  {
    id: "challenge",
    label: "Challenge",
    description: "Choose a challenge and let it decide your film.",
    icon: Trophy,
  },
];

/**
 * The One At A Time Draft Builder's repeating first step (see docs/updates,
 * "ONE AT A TIME DRAFTING — COMPLETE UX" §2) — shown before every single
 * film, not just the first: "Choose your next film." Three full, wide
 * cards (matching the app's existing difficulty-card language — see
 * `DifficultyPicker`) rather than three small buttons, so this genuinely
 * uses the page's available desktop width instead of sitting cramped in
 * one corner.
 */
export function OneAtATimeSourceSelect({
  onSelectRandom,
  onSelectManual,
  onSelectChallenge,
}: {
  onSelectRandom: () => void;
  onSelectManual: () => void;
  onSelectChallenge: () => void;
}) {
  const handlers = {
    random: onSelectRandom,
    manual: onSelectManual,
    challenge: onSelectChallenge,
  } as const;

  return (
    <section className="space-y-3">
      <h2 className="text-foreground text-lg font-bold">
        Choose your next film
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              onClick={handlers[option.id]}
              className="focus-visible:outline-ring border-border bg-card hover:border-primary/50 group flex flex-col items-start gap-3 rounded-xl border p-6 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <span className="bg-secondary text-secondary-foreground flex size-11 items-center justify-center rounded-full">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="text-foreground text-base font-semibold">
                {option.label}
              </span>
              <span className="text-muted-foreground text-sm">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
