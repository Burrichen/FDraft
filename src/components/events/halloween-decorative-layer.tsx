import {
  HalloweenBat,
  HalloweenBunting,
  HalloweenCandle,
  HalloweenCobwebCorner,
  HalloweenGhost,
  HalloweenHangingOrnament,
  HalloweenLeaf,
  HalloweenLollipop,
  HalloweenMoon,
  HalloweenSkull,
  HalloweenStar,
  HalloweenTinyPumpkin,
} from "./halloween-decorations";

/**
 * The Halloween Event page's "central Halloween decorative layer" (see
 * docs/updates, "PROMPT 20 — HIGH-EFFORT HALLOWEEN UI + APPROVED EASTER
 * EGGS" §7, substantially expanded in "PROMPT B2.4 — HALLOWEEN DECORATION
 * + EASTER-EGG ART POLISH" §4-8) — a single, ONE-PLACE composition of
 * small inline SVG pieces scattered across the page's margins, corners,
 * and lower sections, never obstructing real UI. `aria-hidden` and
 * `pointer-events-none` throughout, so it's invisible to assistive tech
 * and never intercepts a click meant for a real control underneath.
 *
 * Every position below is a FIXED Tailwind class, never computed/random —
 * "avoid random decoration jumping on every React render" (§6). Density
 * scales with viewport via responsive-only variants, matching §8's four
 * tiers: nothing extra below `sm` (mobile: minimal — just two small corner
 * webs), a header band + a tucked corner from `sm` (tablet: reduced), a
 * right-margin column + a lower scatter from `lg` (laptop: moderate), and
 * one more pass of bats/leaves/bunting from `xl` (wide desktop: highest
 * density) — never more than a corner web on the smallest screens, per
 * §8's explicit "do not cram ten decorations into a 320px viewport."
 *
 * Deliberately RIGHT-side/lower-margin heavy past the corner webs (see
 * docs/updates, "PROMPT 21 — HALLOWEEN RELEASE HARDENING" §"VISUAL QA"):
 * this layer's own wrapping element spans the page's full remaining width,
 * but the real content (`EventPageView`'s `max-w-2xl` column) is
 * left-aligned within it — so anything positioned from the LEFT edge past
 * a small corner lands directly on top of the header/body text at wide
 * viewports, where the actual empty space is entirely to the right of and
 * below that narrow column instead.
 */
export function HalloweenDecorativeLayer() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Corner webs — every size, shrinking and fading on mobile so they
          clear the header entirely at 320px. */}
      <HalloweenCobwebCorner className="absolute top-0 left-0 size-8 opacity-60 sm:size-24 sm:opacity-100" />
      <HalloweenCobwebCorner className="absolute top-0 right-0 size-8 -scale-x-100 opacity-60 sm:size-24 sm:opacity-100" />

      {/* Header band — tablet and up. */}
      <div className="hidden sm:block">
        <HalloweenMoon className="absolute top-6 right-16 size-8" />
        <HalloweenStar className="absolute top-4 right-32 size-3" />
        <HalloweenStar className="absolute top-16 right-24 size-2" />
        <HalloweenBat className="halloween-bat-sway absolute top-20 right-20 size-6" />
        <HalloweenTinyPumpkin className="absolute bottom-6 left-4 size-6 opacity-80" />
      </div>

      {/* Right-margin column — laptop and up, where the left-aligned
          content column leaves real empty space to its right. */}
      <div className="hidden lg:block">
        <HalloweenBunting className="absolute top-2 right-4 w-28 opacity-70" />
        <HalloweenHangingOrnament className="halloween-ornament-sway absolute top-10 right-6 size-7" />
        <HalloweenGhost className="absolute top-1/2 right-10 size-10 opacity-90" />
        <HalloweenSkull className="absolute top-[62%] right-20 size-5 opacity-60" />
        <HalloweenCandle className="absolute top-[58%] right-32 size-6" />
        <HalloweenLeaf className="absolute right-16 bottom-24 size-5 rotate-12" />
        <HalloweenLollipop className="text-halloween-purple/70 absolute right-8 bottom-12 size-5 -rotate-6" />
      </div>

      {/* Lower scatter — laptop and up, partially tucked near the bottom
          margin (not clustered with the header cluster above). */}
      <div className="hidden lg:block">
        <HalloweenLeaf className="absolute bottom-8 left-10 size-4 -rotate-6 opacity-70" />
        <HalloweenTinyPumpkin className="absolute bottom-2 left-24 size-5 opacity-70" />
        <HalloweenCobwebCorner className="absolute bottom-0 left-0 size-16 -scale-y-100 opacity-40" />
      </div>

      {/* Wide desktop only — the highest density tier: a second bat, more
          stars, and an extra bunting run for a genuinely fuller page. */}
      <div className="hidden xl:block">
        <HalloweenBat className="halloween-bat-sway absolute right-40 bottom-32 size-5 opacity-70 [animation-delay:1.2s]" />
        <HalloweenStar className="absolute top-28 right-44 size-2 opacity-70" />
        <HalloweenStar className="absolute right-24 bottom-40 size-2 opacity-60" />
        <HalloweenLeaf className="absolute right-52 bottom-16 size-4 rotate-45 opacity-60" />
      </div>
    </div>
  );
}
