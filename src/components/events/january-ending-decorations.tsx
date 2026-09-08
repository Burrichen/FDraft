import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Three small, hand-authored, purely decorative SVG pieces for January's
 * Event-ending scene (see docs/updates, "FDRAFT UPDATE 1 — JANUARY
 * EVENT-OVER EXPERIENCE" §3) — the January event itself is bleak (grey,
 * storm clouds, rain, misery); these communicate that finally lifting:
 * one cloud visibly drifting apart/fading rather than a solid overcast
 * mass, a soft cool light breaking through rather than a bright
 * celebratory sun, and a few rain streaks fading out top-to-bottom rather
 * than a downpour. Deliberately monochrome/cool-toned (muted-foreground
 * and the app's own blue accent) — "do not turn it into a colourful
 * celebration." `currentColor`/CSS-var tinted, `aria-hidden` left to the
 * caller (inherited from `EventDecorationLayer`'s own root).
 */
type DecorationProps = SVGProps<SVGSVGElement>;

/** A dense cloud beside a much fainter, smaller one drifting away — the overcast breaking up, not just repositioning. */
export function JanuaryCloudParting({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 48 20"
      fill="currentColor"
      className={cn("text-muted-foreground/60", className)}
      {...props}
    >
      <path
        d="M6 16a5 5 0 0 1-1-9.9A6 6 0 0 1 16.5 3a4.3 4.3 0 0 1 6 4A4 4 0 0 1 21 16H6z"
        opacity={0.85}
      />
      <path
        d="M34 14a4 4 0 0 1-.8-7.9A4.8 4.8 0 0 1 42 4a3.4 3.4 0 0 1 4.8 3.2A3.2 3.2 0 0 1 46 14H34z"
        opacity={0.3}
      />
    </svg>
  );
}

/** A soft, low-contrast glow with a few thin rays — "subtle brighter light... cool blue sky accents," never a bold cartoon sun. */
export function JanuarySoftSun({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("text-watchlist-blue", className)}
      {...props}
    >
      <circle cx="16" cy="16" r="7" fill="currentColor" opacity={0.45} />
      <g
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.35}
      >
        <path d="M16 2v4" />
        <path d="M16 26v4" />
        <path d="M2 16h4" />
        <path d="M26 16h4" />
        <path d="M6.3 6.3l2.8 2.8" />
        <path d="M22.9 22.9l2.8 2.8" />
        <path d="M6.3 25.7l2.8-2.8" />
        <path d="M22.9 9.1l2.8-2.8" />
      </g>
    </svg>
  );
}

/** A few thin rain streaks, each shorter and fainter than the last — the rain stopping, not falling. */
export function JanuaryRainFading({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 24 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.5}
      className={cn("text-watchlist-blue", className)}
      {...props}
    >
      <path d="M4 2v10" opacity={0.5} />
      <path d="M12 0v6" opacity={0.35} />
      <path d="M19 4v8" opacity={0.4} />
      <path d="M7 16v4" opacity={0.22} />
      <path d="M16 18v3" opacity={0.15} />
    </svg>
  );
}
