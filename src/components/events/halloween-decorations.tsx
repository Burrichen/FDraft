import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Small, hand-authored, purely decorative SVG pieces shared by
 * `halloween-decorative-layer.tsx` (the Event page's environmental
 * framing) and `event-intro-dialog.tsx`'s Halloween decoration (see
 * docs/updates, "PROMPT 20 — HIGH-EFFORT HALLOWEEN UI + APPROVED EASTER
 * EGGS"). Kitsch Halloween — paper bats, cobwebs, a crescent moon, candy —
 * never gore, never a copyrighted/external image. Every piece here is
 * `aria-hidden` by the CALLER (these are unopinionated about that, so a
 * future interactive reuse isn't forced to fight it), stroke/fill via
 * `currentColor` so a wrapping `text-*` class controls their tint.
 */
type DecorationProps = SVGProps<SVGSVGElement>;

export function HalloweenBat({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 32 20"
      fill="currentColor"
      className={cn("text-halloween-charcoal-foreground/70", className)}
      {...props}
    >
      <path d="M16 6c-2-4-7-6-11-4 2 1 3 2.5 3.5 4-2-1-5-1-6.5 1 2 0 3.5 1 4.5 2.5-1.5 0-3 .8-3.5 2 2-.5 4-.2 5.5.8L16 16l7.5-3.7c1.5-1 3.5-1.3 5.5-.8-.5-1.2-2-2-3.5-2 1-1.5 2.5-2.5 4.5-2.5-1.5-2-4.5-2-6.5-1 .5-1.5 1.5-3 3.5-4-4-2-9 0-11 4z" />
    </svg>
  );
}

export function HalloweenCobwebCorner({
  className,
  ...props
}: DecorationProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      className={cn("text-halloween-cream/40", className)}
      {...props}
    >
      <path d="M0 0 40 40M0 0 0 40M0 0 40 0" strokeOpacity={0} />
      <path d="M0 8 Q10 8 8 0" />
      <path d="M0 16 Q18 16 16 0" />
      <path d="M0 24 Q26 24 24 0" />
      <path d="M0 32 Q34 32 32 0" />
      <path d="M2 3 Q6 12 2 21" />
      <path d="M4 1.5 Q14 9 12 21" />
      <path d="M6.5 0.5 Q20 5 22 18" />
    </svg>
  );
}

export function HalloweenStar({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn("text-halloween-cream/60", className)}
      {...props}
    >
      <path d="M8 0l1.4 5.2L15 8l-5.6 1.4L8 16l-1.4-6.6L1 8l5.6-2.8z" />
    </svg>
  );
}

export function HalloweenMoon({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("text-halloween-cream/80", className)}
      {...props}
    >
      <path d="M15.5 2a10 10 0 1 0 6.5 17.6A9 9 0 0 1 15.5 2z" />
    </svg>
  );
}

export function HalloweenCandy({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 24 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("text-halloween-pumpkin", className)}
      {...props}
    >
      <path d="M9 4h6a4 4 0 0 1 0 8H9a4 4 0 0 1 0-8z" />
      <path d="M9 4 4 1v10l5-3" />
      <path d="M15 4l5-3v10l-5-3" />
    </svg>
  );
}

/** A small, tuckable jack-o'-lantern silhouette — deliberately simpler/rounder than the nav tab's `HalloweenNavIcon` (see docs/updates, "PROMPT B2.3 — HALLOWEEN JOIN MODAL COMPLETE REDESIGN": "spread throughout... tucked behind card edges"), sized for a corner rather than a nav icon. Given a proper curled stem and visible groove lines in "HALLOWEEN ART DIRECTION & ASSET PASS" §3/§8 — the previous version was a bare filled blob with no ridges at all, exactly the "circle pretending to be an object" complaint that pass called out. */
export function HalloweenTinyPumpkin({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 24 20"
      className={cn("text-halloween-pumpkin", className)}
      {...props}
    >
      <path
        d="M11.5 3c-.3-1.6.6-2.7 1.7-2.7"
        stroke="currentColor"
        fill="none"
        strokeWidth={1.3}
        strokeLinecap="round"
        className="text-halloween-stem"
      />
      <path
        d="M2 12c0-5.5 4.5-8 10-8s10 2.5 10 8c0 4.4-4.5 7-10 7S2 16.4 2 12z"
        fill="currentColor"
      />
      <g
        stroke="oklch(0.15 0.012 290)"
        strokeOpacity={0.3}
        strokeWidth={0.6}
        fill="none"
      >
        <path d="M8 5.5c-1.5 2-1.5 8.5 0 12.5" />
        <path d="M12 4.6v13.8" />
        <path d="M16 5.5c1.5 2 1.5 8.5 0 12.5" />
      </g>
    </svg>
  );
}

/** A small ghost silhouette — flat kitsch style, matching the bat/moon/star convention here rather than the Stats page's stroke-based `HauntedPointsIcon`. */
export function HalloweenGhost({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 20 22"
      fill="currentColor"
      className={cn("text-halloween-cream/90", className)}
      {...props}
    >
      <path d="M10 0a8 8 0 0 0-8 8v13.5l2.7-2.2 2.4 2.2 2.9-2.2 2.9 2.2 2.4-2.2L18 21.5V8a8 8 0 0 0-8-8z" />
      <circle cx="7" cy="9" r="1.1" className="fill-halloween-charcoal" />
      <circle cx="13" cy="9" r="1.1" className="fill-halloween-charcoal" />
    </svg>
  );
}

/** A small vintage paper lantern hanging from a thread — for "hanging decorations" strung along an edge (see docs/updates, "PROMPT B2.3", "DECORATION DEPTH": mid-layer "bats/hanging ornaments"; redrawn from a plain circle-on-a-thread in "HALLOWEEN ART DIRECTION & ASSET PASS" §3/§8 — an accordion-pleated paper lantern with a cap/base and a warm glow slit, the kind of period-correct honeycomb decoration this palette is built around, not a dot. Callers vary length/rotation for a natural, uneven hang. */
export function HalloweenHangingOrnament({
  className,
  ...props
}: DecorationProps) {
  return (
    <svg viewBox="0 0 12 30" fill="none" className={cn(className)} {...props}>
      <path
        d="M6 0v6"
        stroke="currentColor"
        strokeWidth={1}
        className="text-halloween-cream/50"
      />
      <path d="M2.5 6h7l-1 2h-5z" className="fill-halloween-purple/70" />
      <path
        d="M2 8c0 6-1.2 10 0 16 1 2 8 2 9 0 1.2-6 0-10 0-16z"
        className="fill-halloween-pumpkin/85"
        stroke="oklch(0.15 0.012 290)"
        strokeWidth={0.6}
      />
      <path
        d="M2.4 11h8M2.1 15h8.6M2.4 19h8"
        stroke="oklch(0.15 0.012 290)"
        strokeWidth={0.5}
        opacity={0.35}
      />
      <path d="M2.5 24h7l-1 2h-5z" className="fill-halloween-purple/70" />
      <rect
        x="5"
        y="10"
        width="2"
        height="10"
        rx="1"
        className="fill-halloween-glow/80"
        opacity={0.7}
      />
    </svg>
  );
}

/** A small, rounded skull motif (see docs/updates, "PROMPT B2.4 — HALLOWEEN DECORATION + EASTER-EGG ART POLISH" §4) — "bones/skull motifs used sparingly," kitsch/rounded rather than anatomical, never used more than once or twice in any composition. */
export function HalloweenSkull({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={cn("text-halloween-cream/70", className)}
      {...props}
    >
      <path d="M10 1.5a7.2 7.2 0 0 0-7.2 7.2c0 2.7 1.4 5 3.5 6.4.1.9.1 1.8.1 2.4a1 1 0 0 0 1 1h.5v-1.6h.9v1.6h1.4v-1.6h.9v1.6h.5a1 1 0 0 0 1-1c0-.6 0-1.5.1-2.4a7.6 7.6 0 0 0 3.5-6.4A7.2 7.2 0 0 0 10 1.5z" />
      <ellipse
        cx="6.7"
        cy="9.2"
        rx="1.5"
        ry="1.8"
        className="fill-halloween-charcoal"
      />
      <ellipse
        cx="13.3"
        cy="9.2"
        rx="1.5"
        ry="1.8"
        className="fill-halloween-charcoal"
      />
      <path d="M9.3 10.8h1.4l-.7 1.4z" className="fill-halloween-charcoal" />
    </svg>
  );
}

/** A single curled autumn leaf — seasonal dressing distinct from anything Halloween-specific, deliberately left unanimated (see globals.css's performance note: only established interactions animate). */
export function HalloweenLeaf({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={cn("text-halloween-pumpkin/70", className)}
      {...props}
    >
      <path d="M10 1c4.2 2.8 8 7 8 11.2A6 6 0 0 1 12 18.4c-1 0-2-.2-2.9-.7.9-1 2.9-3.7 2.9-3.7s-4 1-7-1.9c-3-2.9-3.4-7.4-.6-10C6.7 1.6 8.4 1 10 1z" />
      <path
        d="M10.2 2.4c-.6 5-.2 10 2 14.6"
        stroke="var(--halloween-charcoal)"
        strokeOpacity={0.4}
        strokeWidth={0.8}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** A short string of three bunting flags on a thread — "little Halloween bunting" — sized to run along a header or divider like `HalloweenHangingOrnament`. */
export function HalloweenBunting({ className, ...props }: DecorationProps) {
  return (
    <svg viewBox="0 0 60 20" fill="none" className={cn(className)} {...props}>
      <path
        d="M0 2h60"
        stroke="currentColor"
        strokeWidth={1}
        className="text-halloween-cream/40"
      />
      <path d="M6 2l8 12 8-12z" className="fill-halloween-pumpkin/80" />
      <path d="M24 2l8 12 8-12z" className="fill-halloween-purple/70" />
      <path d="M42 2l8 12 8-12z" className="fill-halloween-pumpkin/80" />
    </svg>
  );
}

/** A dimensional wax-cylinder candle with a soft flame — the previous version was a single bare stroked line with no visible body at all (see docs/updates, "HALLOWEEN ART DIRECTION & ASSET PASS" §3: "candles or small vintage ornaments"); now a real tapered wax body with a highlight stripe, drip texture, and a wick, plus a slight crooked lean for handmade charm. The flame gets a gentle flicker via `.halloween-candle-flicker` (reduced-motion gated, see globals.css), the one animated decoration in this file besides the bat/ornament sway. */
export function HalloweenCandle({ className, ...props }: DecorationProps) {
  return (
    <svg viewBox="0 0 12 24" fill="none" className={cn(className)} {...props}>
      <ellipse
        cx="6"
        cy="23"
        rx="4.5"
        ry="1"
        className="fill-halloween-charcoal/40"
      />
      <path
        d="M2.6 22.5 3 10c.1-1 .6-1.6 1.2-2l1-.6-.3 14.6z"
        fill="var(--halloween-cream)"
        fillOpacity={0.65}
      />
      <path
        d="M4.9 7.4 6.1 6.8c.6.4 1.1 1 1.2 2l.5 13.2-3.4.1z"
        fill="var(--halloween-cream)"
        fillOpacity={0.4}
      />
      <path
        d="M3.9 22.6 4.3 9.2"
        stroke="var(--halloween-charcoal)"
        strokeOpacity={0.25}
        strokeWidth={0.7}
        strokeLinecap="round"
      />
      <path
        d="M5 9c.4-.6.9-.4 1.1.4"
        stroke="var(--halloween-charcoal)"
        strokeOpacity={0.3}
        strokeWidth={0.6}
        fill="none"
      />
      <path
        d="M5.6 7.5 5.9 5.6"
        stroke="var(--halloween-charcoal)"
        strokeOpacity={0.5}
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      <path
        d="M6.5 6c-1.4 1.6-1.9 3-1 4.2.9-1 1.7-1 2.3 0 .8-1.4.2-2.8-1.3-4.2z"
        className="halloween-candle-flicker fill-halloween-pumpkin"
      />
    </svg>
  );
}

/** A swirled lollipop — the previous version was a plain flat circle with two faint arcs, exactly the "circle pretending to be an object" complaint (see docs/updates, "HALLOWEEN ART DIRECTION & ASSET PASS" §1/§3); now a genuine painted spiral swirl on the disc, alongside `HalloweenCandy`'s bowtie wrapper for shape variety in the candy bowl and any ambient decoration cluster. */
export function HalloweenLollipop({ className, ...props }: DecorationProps) {
  return (
    <svg viewBox="0 0 16 20" fill="none" className={cn(className)} {...props}>
      <path
        d="M8 20V9"
        stroke="var(--halloween-cream)"
        strokeOpacity={0.5}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <circle
        cx="8"
        cy="6"
        r="6"
        fill="currentColor"
        stroke="oklch(0.15 0.012 290)"
        strokeWidth={0.5}
        strokeOpacity={0.4}
      />
      <path
        d="M8 6 8 1.3A4.7 4.7 0 0 1 12.7 6 4.7 4.7 0 0 1 8 10.7 3.3 3.3 0 0 1 4.7 7.4 2 2 0 0 1 6.7 5.4"
        stroke="var(--halloween-charcoal)"
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** A round bonbon with twisted wrapper ends — a third candy silhouette (see docs/updates, "HALLOWEEN ART DIRECTION & ASSET PASS" §3/§6) distinct from `HalloweenCandy`'s bowtie and `HalloweenLollipop`'s disc, for genuine shape variety inside the candy bowl. */
export function HalloweenWrappedCandy({
  className,
  ...props
}: DecorationProps) {
  return (
    <svg
      viewBox="0 0 22 14"
      fill="currentColor"
      className={cn(className)}
      {...props}
    >
      <path d="M6 2 1 0v14l5-2z" />
      <path d="M16 2 21 0v14l-5-2z" />
      <circle cx="11" cy="7" r="6" />
      <path
        d="M7 4.5 15 9.5M15 4.5 7 9.5"
        stroke="oklch(0.15 0.012 290)"
        strokeOpacity={0.2}
        strokeWidth={0.8}
        fill="none"
      />
    </svg>
  );
}
