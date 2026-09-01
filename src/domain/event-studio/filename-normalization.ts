/**
 * Filename safety for Import Image (see docs/updates, "EVENT STUDIO —
 * PHASE 9" §5) — normalizes into the exact shape
 * `fdraft-theme-schema.ts`'s own asset-path validation already requires
 * (`[a-zA-Z0-9][a-zA-Z0-9_.-]*`), so an imported file can never itself
 * be the reason a theme fails schema validation later. Deliberately
 * idempotent for an already-clean filename ("Do not unnecessarily
 * rename good existing filenames") — `ghost-peeking.png` in, unchanged,
 * out; only a genuinely messy name like `"Ghost Peeking FINAL (2)!!!!.png"`
 * actually gets rewritten (to `"ghost-peeking-final-2.png"`).
 */
export function normalizeAssetFilename(original: string): string {
  const trimmed = original.trim();
  const lastDot = trimmed.lastIndexOf(".");
  const hasExtension = lastDot > 0 && lastDot < trimmed.length - 1;
  const stem = hasExtension ? trimmed.slice(0, lastDot) : trimmed;
  const extension = hasExtension
    ? trimmed.slice(lastDot + 1).toLowerCase()
    : "";

  const slug =
    stem
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "") || "asset";

  return extension ? `${slug}.${extension}` : slug;
}
