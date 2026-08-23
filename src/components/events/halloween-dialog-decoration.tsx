import {
  HalloweenBat,
  HalloweenCandy,
  HalloweenCobwebCorner,
  HalloweenGhost,
  HalloweenHangingOrnament,
  HalloweenMoon,
  HalloweenStar,
  HalloweenTinyPumpkin,
} from "./halloween-decorations";

/**
 * The opt-in modal's decoration (see docs/updates, "PROMPT B2.3 —
 * HALLOWEEN JOIN MODAL COMPLETE REDESIGN" §4/§5 — supersedes the smaller,
 * heading-clustered composition from Prompt 20 now that the modal itself
 * is much larger). Spread across the WHOLE card via corners/edges/negative
 * space in three depth layers, rather than concentrated near the title:
 *
 *  - background: a crescent moon, scattered stars, cobweb corners — low
 *    opacity, furthest back;
 *  - mid: a swaying bat and a few hanging ornaments strung along the top
 *    edge, like bunting;
 *  - foreground: tiny pumpkins, a candy scatter, and a ghost peeking from
 *    a bottom corner, each nudged partly off/behind the card edge for a
 *    "tucked in" feel.
 *
 * All inline SVG/CSS (no external/copyrighted images, no emoji as visual
 * assets). Rendered by `EventIntroDialog` via `EventVisualTheme.
 * renderDecoration` — a fully generic hook, so this stays the ONLY
 * Halloween-specific file involved; the dialog component itself has no
 * per-event branch. Absolutely positioned within the dialog's own
 * `relative` content, `aria-hidden` and `pointer-events-none` throughout
 * so it's invisible to screen readers and never intercepts a click meant
 * for the real controls underneath — deliberately kept clear of the
 * footer button row and the main copy column so it never visually
 * obscures either.
 */
export function renderHalloweenDialogDecoration() {
  return (
    <div
      aria-hidden="true"
      className="halloween-modal-decoration-settle pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      {/* Background layer — moon, stars, cobwebs; low opacity, furthest back. */}
      <HalloweenCobwebCorner className="absolute top-0 left-0 size-14 opacity-70 sm:size-20" />
      <HalloweenCobwebCorner className="absolute top-0 right-0 size-14 -scale-x-100 opacity-70 sm:size-20" />
      <HalloweenMoon className="absolute top-6 right-8 size-7 opacity-90 sm:top-8 sm:right-14 sm:size-10" />
      <HalloweenStar className="absolute top-10 right-24 size-2.5 opacity-70 sm:top-14 sm:right-32" />
      <HalloweenStar className="absolute top-20 right-16 size-2 opacity-60 sm:top-28 sm:right-24" />
      <HalloweenStar className="hidden size-2 opacity-50 sm:absolute sm:top-16 sm:left-24 sm:block" />

      {/* Mid layer — a swaying bat and hanging ornaments strung along the top edge. */}
      <HalloweenBat className="halloween-bat-sway absolute top-10 left-10 size-5 opacity-90 sm:top-12 sm:left-16 sm:size-7" />
      <div className="absolute inset-x-10 top-0 hidden justify-around sm:flex md:inset-x-16">
        <HalloweenHangingOrnament className="halloween-ornament-sway size-6" />
        <HalloweenHangingOrnament className="halloween-ornament-sway size-8 [animation-delay:400ms]" />
        <HalloweenHangingOrnament className="halloween-ornament-sway size-5 [animation-delay:200ms]" />
      </div>

      {/* Foreground — tucked into corners/edges, never near the footer buttons. */}
      <HalloweenTinyPumpkin className="absolute -bottom-2 left-4 size-8 opacity-90 sm:-bottom-3 sm:left-8 sm:size-11" />
      <HalloweenGhost className="absolute top-1/2 -right-2 size-9 -translate-y-1/2 opacity-80 sm:size-12" />
      <div className="absolute right-8 bottom-2 hidden items-end gap-3 opacity-80 sm:flex">
        <HalloweenCandy className="size-4 -rotate-6" />
        <HalloweenCandy className="size-5 rotate-12" />
        <HalloweenCandy className="size-4 -rotate-3" />
      </div>
    </div>
  );
}
