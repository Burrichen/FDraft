/**
 * "Your Draft So Far"'s per-item source label (see docs/updates, "FDRAFT
 * UPDATE 1 — EVENT ONE AT A TIME DRAFTING" §14) — the SAME formatting
 * normal One At A Time already uses ("Random"/"Chosen"/"Challenge: <name>"),
 * with an optional category prefix ("Horror · Random", "Kitsch · Chosen",
 * "Horror · Challenge: <name>") for a category-based Event item.
 * `categoryLabel` absent/null reproduces the exact normal-flow string —
 * this is a pure extraction of `OneAtATimeStagedGrid`'s pre-existing inline
 * `sourceLabel` function, not a behavior change for it.
 */
export function formatOneAtATimeSourceLabel(params: {
  source: "random" | "manual" | "challenge";
  challengeId: string | null;
  challengeName: string | null;
  categoryLabel?: string | null;
}): string {
  const origin =
    params.source === "random"
      ? "Random"
      : params.source === "manual"
        ? "Chosen"
        : `Challenge: ${params.challengeName ?? params.challengeId}`;
  return params.categoryLabel ? `${params.categoryLabel} · ${origin}` : origin;
}
