import type { FreeformRank } from "@/repositories";

/**
 * Freeform's achieved rank at the end of the period, based on how many
 * films were actually completed — never generated-but-unwatched films (see
 * docs/product-spec.md, "Freeform Mode").
 *
 * Thresholds are inclusive lower bounds, checked from highest to lowest.
 */
const RANK_THRESHOLDS: { min: number; rank: FreeformRank }[] = [
  { min: 20, rank: "hardcore" },
  { min: 12, rank: "hard" },
  { min: 10, rank: "medium" },
  { min: 8, rank: "easy" },
  { min: 5, rank: "baby" },
  { min: 0, rank: "below_baby" },
];

export function calculateFreeformRank(
  completedFilmCount: number,
): FreeformRank {
  if (completedFilmCount < 0 || !Number.isInteger(completedFilmCount)) {
    throw new Error(
      `calculateFreeformRank: expected a non-negative integer, got ${completedFilmCount}`,
    );
  }
  const match = RANK_THRESHOLDS.find(
    (threshold) => completedFilmCount >= threshold.min,
  );
  // RANK_THRESHOLDS always has a min: 0 entry, so this is unreachable, but
  // keeps the return type non-null without a non-null assertion.
  return match?.rank ?? "below_baby";
}

export const FREEFORM_RANK_LABELS: Record<FreeformRank, string> = {
  below_baby: "Below Baby",
  baby: "Baby",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  hardcore: "Hardcore",
};
