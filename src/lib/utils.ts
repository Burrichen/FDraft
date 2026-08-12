import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A human-readable date — "9 August 2026", never a raw ISO string (see
 * docs/product-spec.md, "WATCHED DATE FORMAT"). `"long"` (the default)
 * spells the month out in full, matching that section's own example;
 * `"medium"` (already used by the Draft History page's date ranges)
 * abbreviates it. Uses the browser's own locale/timezone via `undefined`
 * — the same convention already used everywhere else a date is displayed
 * in this app (e.g. `additions-card.tsx`), not a new one.
 */
export function formatReadableDate(
  iso: string,
  style: "long" | "medium" = "long",
): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: style });
}
