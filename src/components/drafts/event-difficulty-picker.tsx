import {
  CREATABLE_DIFFICULTY_ORDER,
  DIFFICULTIES,
  isOneAtATime,
} from "@/domain/drafts/difficulty";
import type { DraftDifficulty } from "@/repositories";
import { cn } from "@/lib/utils";

/**
 * Every difficulty an EVENT Draft can be created at — read straight from
 * the shared `CREATABLE_DIFFICULTY_ORDER` (see docs/updates, "FDRAFT
 * UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §2: "Do not
 * maintain separate hard-coded Halloween Baby = X / Christmas Baby = X
 * tables"), never a per-event literal list.
 *
 * This REPLACED a hand-maintained `HALLOWEEN_DIFFICULTY_ORDER` literal
 * that happened to duplicate `CREATABLE_DIFFICULTY_ORDER` exactly. Reading
 * the shared list instead is what makes every Event automatically inherit
 * a future safe adjustment to the difficulty set — including the two
 * restrictions this list already encodes centrally: Freeform is excluded
 * (it is retired as a creation mode app-wide, see `CREATABLE_DIFFICULTY_ORDER`),
 * and One At A Time is included (see docs/updates, "FDRAFT UPDATE 1 —
 * EVENT ONE AT A TIME DRAFTING" §1).
 */
export const EVENT_DIFFICULTY_ORDER: Exclude<DraftDifficulty, "freeform">[] =
  CREATABLE_DIFFICULTY_ORDER as Exclude<DraftDifficulty, "freeform">[];

interface EventDifficultyPickerProps {
  selected: Exclude<DraftDifficulty, "freeform"> | null;
  onSelect: (id: Exclude<DraftDifficulty, "freeform">) => void;
  /**
   * Tailwind classes for the SELECTED tile — lets a themed Event page tint
   * its own selected state (see docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS
   * DRAFT DIFFICULTIES + VISUAL POLISH" §17, "difficulty selected state").
   * Omitted keeps the app's own `--primary`-derived default, which is
   * already correct inside a `.theme-*` subtree that reroutes that token.
   */
  selectedClassName?: string;
}

/**
 * The `DifficultyPicker` sibling every EVENT Draft creation flow shares —
 * Halloween's and Christmas's alike (see docs/updates, "FDRAFT UPDATE 1 —
 * CHRISTMAS DRAFT DIFFICULTIES + VISUAL POLISH" §1/§2). Formerly
 * `HalloweenDifficultyPicker`; renamed and generalized rather than copied,
 * so the two events cannot drift apart.
 *
 * Same central `DIFFICULTIES` config as every other picker in the app, so
 * film counts live in exactly one place. Deliberately does NOT gate on raw
 * watchlist size the way the normal `/drafts/new` picker does — an Event's
 * curated pools have their own, separately-displayed availability (see
 * `HalloweenLinkedSliders`/`ChristmasLinkedSliders`).
 */
export function EventDifficultyPicker({
  selected,
  onSelect,
  selectedClassName,
}: EventDifficultyPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {EVENT_DIFFICULTY_ORDER.map((id) => {
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
                ? (selectedClassName ?? "border-primary bg-secondary")
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
