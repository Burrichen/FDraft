import {
  HalloweenBat,
  HalloweenCobwebCorner,
  HalloweenMoon,
  HalloweenStar,
} from "./halloween-decorations";

/**
 * The Halloween Event page's "central Halloween decorative layer" (see
 * docs/updates, "PROMPT 20 — HIGH-EFFORT HALLOWEEN UI + APPROVED EASTER
 * EGGS" §7) — a handful of small, inline SVG pieces sitting around the
 * page's edges/margins/header, never obstructing real UI. `aria-hidden`
 * and `pointer-events-none` throughout, so it's invisible to assistive
 * tech and never intercepts a click meant for a real control underneath.
 *
 * Density drops significantly on mobile (§7's own requirement — and see
 * docs/updates, "PROMPT 21 — HALLOWEEN RELEASE HARDENING" §"VISUAL QA":
 * a 320px viewport was found visually crowding the page header with the
 * original `size-16` corner webs, despite being behind the content
 * z-index-wise — a transparent header has nothing to visually separate it
 * from decoration sitting just behind it, so "behind" alone isn't enough
 * at the smallest sizes; the decoration itself needs to shrink and fade).
 * The full cluster (moon, stars, two corner webs) only renders at `sm:`
 * and up; below that, only two much smaller, fainter corner cobwebs
 * remain, sized and placed to clear the header entirely.
 *
 * Deliberately RIGHT-side only past the two corner webs (see docs/updates,
 * "PROMPT 21 — HALLOWEEN RELEASE HARDENING" §"VISUAL QA"): this layer's
 * own wrapping element spans the page's full remaining width, but the
 * real content (`EventPageView`'s `max-w-2xl` column) is left-aligned
 * within it — so anything positioned from the LEFT edge lands directly on
 * top of the header/body text at wide viewports, where the actual empty
 * space is entirely to the right of that narrow column instead. A
 * left-positioned bat and star originally sat here and were removed for
 * exactly that reason (found overlapping "Halloween" at 1920px).
 */
export function HalloweenDecorativeLayer() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <HalloweenCobwebCorner className="absolute top-0 left-0 size-8 opacity-60 sm:size-24 sm:opacity-100" />
      <HalloweenCobwebCorner className="absolute top-0 right-0 size-8 -scale-x-100 opacity-60 sm:size-24 sm:opacity-100" />
      <div className="hidden sm:block">
        <HalloweenMoon className="absolute top-6 right-16 size-8" />
        <HalloweenStar className="absolute top-4 right-32 size-3" />
        <HalloweenStar className="absolute top-16 right-24 size-2" />
        <HalloweenBat className="halloween-bat-sway absolute top-20 right-20 size-6" />
      </div>
    </div>
  );
}
