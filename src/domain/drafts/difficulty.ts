import type { DraftDifficulty } from "@/repositories";

/**
 * Single source of truth for difficulty film counts and copy. Nothing else
 * in the codebase should hardcode "5 films" / "medium = 10" etc. — read it
 * from here so the numbers in docs/product-spec.md only ever live in one
 * place.
 *
 * Freeform has no fixed film count: it grows in batches of
 * FREEFORM_BATCH_SIZE as the user generates more (see freeform.ts for how
 * its achieved rank is calculated at the end of the period).
 */
export interface DifficultyDefinition {
  id: DraftDifficulty;
  label: string;
  /** Fixed total film count for this difficulty, or null for freeform. */
  filmCount: number | null;
  description: string;
}

export const FREEFORM_BATCH_SIZE = 5;

export const DIFFICULTIES: Record<DraftDifficulty, DifficultyDefinition> = {
  baby: {
    id: "baby",
    label: "Baby",
    filmCount: 5,
    description: "A gentle five-film introduction to Monthly Watchlist Drafts.",
  },
  easy: {
    id: "easy",
    label: "Easy",
    filmCount: 8,
    description: "A light eight-film challenge for a busy month.",
  },
  medium: {
    id: "medium",
    label: "Medium",
    filmCount: 10,
    description: "The standard ten-film Monthly Watchlist Draft.",
  },
  hard: {
    id: "hard",
    label: "Hard",
    filmCount: 12,
    description: "Twelve films — a serious dent in the watchlist.",
  },
  hardcore: {
    id: "hardcore",
    label: "Hardcore",
    filmCount: 20,
    description: "Twenty films. Clear your calendar.",
  },
  freeform: {
    id: "freeform",
    label: "Freeform",
    filmCount: null,
    description: `Generate films in batches of ${FREEFORM_BATCH_SIZE} as you go. Your rank is determined by how many you finish.`,
  },
  "one-at-a-time": {
    id: "one-at-a-time",
    label: "One At A Time",
    filmCount: null,
    description:
      "Pick films one at a time — Random, Choose My Own, or a Challenge — and stop whenever the list feels big enough.",
  },
};

export const DIFFICULTY_ORDER: DraftDifficulty[] = [
  "baby",
  "easy",
  "medium",
  "hard",
  "hardcore",
  "freeform",
  "one-at-a-time",
];

/**
 * Freeform is retired as a creation mode (see docs/product-spec.md,
 * "FREEFORM MODE" — kept legacy-only for reading historical drafts). Every
 * NEW-draft entry point (pickers, URL-param guards) should iterate/validate
 * against this list instead of `DIFFICULTY_ORDER`.
 */
export const CREATABLE_DIFFICULTY_ORDER: DraftDifficulty[] =
  DIFFICULTY_ORDER.filter((id) => id !== "freeform");

/** Type guard for an untrusted value (e.g. a URL search param) — never trust a raw string as a `DraftDifficulty` without going through this first. Accepts legacy values (e.g. "freeform") — use `isCreatableDraftDifficulty` at a NEW-draft entry point instead. */
export function isDraftDifficulty(value: unknown): value is DraftDifficulty {
  return (
    typeof value === "string" && (DIFFICULTY_ORDER as string[]).includes(value)
  );
}

/** Type guard for a difficulty that can still be used to start a NEW draft — excludes legacy-only values like "freeform". Use this (not `isDraftDifficulty`) anywhere a raw string reaches a draft-creation flow, so a hand-crafted `?difficulty=freeform` URL can't reach it. */
export function isCreatableDraftDifficulty(
  value: unknown,
): value is DraftDifficulty {
  return (
    typeof value === "string" &&
    (CREATABLE_DIFFICULTY_ORDER as string[]).includes(value)
  );
}

export function getDifficulty(id: DraftDifficulty): DifficultyDefinition {
  return DIFFICULTIES[id];
}

export function isFreeform(id: DraftDifficulty): boolean {
  return id === "freeform";
}

/** See `DraftDifficulty`'s own doc comment — a distinct creation mode, never a numeric size. */
export function isOneAtATime(id: DraftDifficulty): boolean {
  return id === "one-at-a-time";
}

/** Fixed film count for a non-freeform, non-one-at-a-time difficulty. Throws for either of those, which have no fixed count. */
export function getFilmCount(id: DraftDifficulty): number {
  const definition = DIFFICULTIES[id];
  if (definition.filmCount === null) {
    throw new Error(
      `getFilmCount: '${id}' has no fixed film count — freeform grows in batches (use FREEFORM_BATCH_SIZE), and one-at-a-time's count is whatever was actually staged`,
    );
  }
  return definition.filmCount;
}
