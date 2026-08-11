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
};

export const DIFFICULTY_ORDER: DraftDifficulty[] = [
  "baby",
  "easy",
  "medium",
  "hard",
  "hardcore",
  "freeform",
];

export function getDifficulty(id: DraftDifficulty): DifficultyDefinition {
  return DIFFICULTIES[id];
}

export function isFreeform(id: DraftDifficulty): boolean {
  return id === "freeform";
}

/** Fixed film count for a non-freeform difficulty. Throws for freeform, which has no fixed count. */
export function getFilmCount(id: DraftDifficulty): number {
  const definition = DIFFICULTIES[id];
  if (definition.filmCount === null) {
    throw new Error(
      `getFilmCount: '${id}' has no fixed film count — freeform grows in batches, use FREEFORM_BATCH_SIZE`,
    );
  }
  return definition.filmCount;
}
