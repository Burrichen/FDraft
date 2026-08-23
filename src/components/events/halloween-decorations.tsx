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
