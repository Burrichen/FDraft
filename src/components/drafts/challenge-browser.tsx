"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ChallengeAvailability {
  id: string;
  name: string;
  description: string;
  category: string;
  interactive: boolean;
  eligible: boolean;
  ineligibleReason: string | null;
}

interface ChallengeBrowserProps {
  challenges: ChallengeAvailability[];
  availableGenres: string[];
  slotsNeeded: number;
  selectedChallengeIds: string[];
  onChange: (ids: string[]) => void;
  /**
   * `"multi"` (default, unchanged) shows the "X of Y challenges chosen"
   * summary plus a dashed "Empty slot" placeholder per remaining slot —
   * exactly right when filling several slots for a normal Draft's bulk
   * generation. `"single"` (see docs/updates, "ONE AT A TIME DRAFTING —
   * COMPLETE UX" §5) drops both: with exactly one slot, "0 of 1 challenge
   * chosen" and a lone "Empty slot" badge read as leftover multi-slot
   * chrome rather than a genuine status, so this mode shows nothing until
   * a challenge is actually picked, then just its removable chip.
   */
  variant?: "multi" | "single";
  manualGenre: string;
  onManualGenreChange: (genre: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  "watchlist-age": "Watchlist age",
  runtime: "Runtime",
  ratings: "Ratings",
  popularity: "Popularity",
  genres: "Genres",
  directors: "Directors",
  "country-language": "Country/language",
  collections: "Collections",
  contextual: "Contextual",
  meta: "Meta",
};

/**
 * The "Choose My Challenge" browser (see docs/product-spec.md, "Choose My
 * Challenge": "a searchable/selectable challenge browser"). Selections fill
 * `slotsNeeded` ordered slots — clicking an eligible challenge fills the
 * next empty one; each filled slot shows as a removable chip. When Genre
 * Roulette is among the selections, a genre picker appears, satisfying
 * "Allow genre selection for Genre Roulette".
 */
export function ChallengeBrowser({
  challenges,
  availableGenres,
  slotsNeeded,
  selectedChallengeIds,
  onChange,
  variant = "multi",
  manualGenre,
  onManualGenreChange,
}: ChallengeBrowserProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = query
      ? challenges.filter(
          (challenge) =>
            challenge.name.toLowerCase().includes(query) ||
            challenge.description.toLowerCase().includes(query),
        )
      : challenges;
    return [...list].sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
  }, [challenges, search]);

  const filledSlotCount = selectedChallengeIds.length;
  const hasEmptySlot = filledSlotCount < slotsNeeded;
  const hasGenreRoulette = selectedChallengeIds.includes("genre-roulette");

  function addChallenge(id: string) {
    if (!hasEmptySlot) return;
    onChange([...selectedChallengeIds, id]);
  }

  function removeSlot(index: number) {
    onChange(selectedChallengeIds.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {variant === "multi" || filledSlotCount > 0 ? (
        <div className="space-y-2">
          {variant === "multi" ? (
            <p className="text-foreground text-sm font-medium">
              {filledSlotCount} of {slotsNeeded} challenge
              {slotsNeeded === 1 ? "" : "s"} chosen
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {selectedChallengeIds.map((id, index) => {
              const challenge = challenges.find((c) => c.id === id);
              return (
                <Badge
                  key={`${id}-${index}`}
                  variant="secondary"
                  className="gap-1 py-1 pr-1 pl-2"
                >
                  {challenge?.name ?? id}
                  <button
                    type="button"
                    onClick={() => removeSlot(index)}
                    aria-label={`Remove ${challenge?.name ?? id}`}
                    className="hover:bg-muted-foreground/20 focus-visible:outline-ring rounded-full p-0.5 focus-visible:outline-2"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </Badge>
              );
            })}
            {variant === "multi"
              ? Array.from(
                  { length: Math.max(0, slotsNeeded - filledSlotCount) },
                  (_, i) => (
                    <Badge
                      key={`empty-${i}`}
                      variant="outline"
                      className="text-muted-foreground border-dashed"
                    >
                      Empty slot
                    </Badge>
                  ),
                )
              : null}
          </div>
        </div>
      ) : null}

      {hasGenreRoulette ? (
        <div className="space-y-1.5">
          <Label htmlFor="manual-genre-select">Genre Roulette genre</Label>
          <select
            id="manual-genre-select"
            value={manualGenre}
            onChange={(event) => onManualGenreChange(event.target.value)}
            className="border-input bg-background text-foreground focus-visible:outline-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <option value="">Let it pick randomly</option>
            {availableGenres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search challenges…"
          className="pl-8"
          aria-label="Search challenges"
        />
      </div>

      {/* `lg:grid-cols-2` alone stayed frozen at 2 columns even at very
          wide viewports (2560px+) — see docs/product-spec.md, "Desktop
          Layout Width" — leaving each challenge card ~3x wider than its
          one-line label needs while most of a large-desktop window sat
          unused. `xl`/`2xl` steps let it keep gaining columns instead. */}
      <ul className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto pr-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((challenge) => {
          const disabled = !challenge.eligible || !hasEmptySlot;
          return (
            <li key={challenge.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => addChallenge(challenge.id)}
                className={cn(
                  "focus-visible:outline-ring w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                  challenge.eligible
                    ? "border-border bg-card hover:border-primary/50"
                    : "border-border bg-muted/40",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-foreground text-sm font-semibold">
                    {challenge.name}
                  </p>
                  <Badge
                    variant="secondary"
                    className="shrink-0 text-[0.65rem]"
                  >
                    {CATEGORY_LABELS[challenge.category] ?? challenge.category}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {challenge.description}
                </p>
                {challenge.interactive ? (
                  <p className="text-watchlist-blue mt-1 text-[0.65rem] font-semibold tracking-wide uppercase">
                    Interactive
                  </p>
                ) : null}
                {!challenge.eligible && challenge.ineligibleReason ? (
                  <p className="text-destructive mt-1 text-xs">
                    {challenge.ineligibleReason}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No matching challenges.
          </p>
        ) : null}
      </ul>
    </div>
  );
}
