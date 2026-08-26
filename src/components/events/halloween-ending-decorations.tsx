import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Two small, hand-authored, purely decorative SVG pieces specific to
 * Halloween's Event-ending scene (see docs/updates, "EVENT SYSTEM —
 * EVENT-OVER EXPERIENCE" §8) — kept separate from `halloween-decorations.
 * tsx` because they exist ONLY for the quieter "the party's over" mood,
 * not general ambient dressing. Every other ending piece (faded pumpkin,
 * empty candy bowl, departing ghost, leaves, sparse cobwebs) reuses
 * existing artwork already bundled for the join modal/interactive easter
 * eggs (see `halloween-ending-decoration-registry.tsx`) — these two are
 * the only genuinely new shapes this scene needed. Same conventions as
 * `halloween-decorations.tsx`: `currentColor`/CSS-var tinted, `aria-hidden`
 * left to the caller, kitsch never gore.
 */
type DecorationProps = SVGProps<SVGSVGElement>;

/** A single soft cloud, drifting across (and partially revealing) the moon — see `"moon-clearing"` in the decoration registry. */
export function HalloweenCloud({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 32 16"
      fill="currentColor"
      className={cn("text-halloween-cream/50", className)}
      {...props}
    >
      <path d="M8 12a5 5 0 0 1-1-9.9A6 6 0 0 1 18.5 1a4.5 4.5 0 0 1 6.4 4.3A4.3 4.3 0 0 1 24 14H8z" />
    </svg>
  );
}

/** `HalloweenCandle`'s wax body with the flame left out and a faint wisp of smoke in its place — the extinguished counterpart used only by the ending scene (see `"candle-out"` in the decoration registry); every other appearance of a candle elsewhere in the app stays the normal, lit `HalloweenCandle`. */
export function HalloweenCandleExtinguished({
  className,
  ...props
}: DecorationProps) {
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
        fillOpacity={0.5}
      />
      <path
        d="M4.9 7.4 6.1 6.8c.6.4 1.1 1 1.2 2l.5 13.2-3.4.1z"
        fill="var(--halloween-cream)"
        fillOpacity={0.3}
      />
      <path
        d="M3.9 22.6 4.3 9.2"
        stroke="var(--halloween-charcoal)"
        strokeOpacity={0.25}
        strokeWidth={0.7}
        strokeLinecap="round"
      />
      <path
        d="M5.6 7.5 5.9 5.6"
        stroke="var(--halloween-charcoal)"
        strokeOpacity={0.5}
        strokeWidth={0.9}
        strokeLinecap="round"
      />
      <path
        d="M5.7 5.2c.6 1 1 2.2.4 3"
        stroke="currentColor"
        strokeOpacity={0.35}
        strokeWidth={0.8}
        strokeLinecap="round"
        fill="none"
        className="text-halloween-cream"
      />
    </svg>
  );
}
