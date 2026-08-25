import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Small, ambient Christmas accents — the same "SVG for tiny lightweight
 * decorative accents" split the Halloween asset pack already established
 * (see `halloween-decorations.tsx`, and the format rule in
 * `public/events/README.md`). Deliberately plain/placeholder-quality
 * shapes, same as every other Christmas scaffold asset in this phase (see
 * docs/updates, "EVENT ART SYSTEM — DESIGNED SLOTS + WEIGHTED VARIANTS"
 * §8) — proving the Designed Slot system works for a second event, not
 * a real Christmas art direction pass.
 */
type DecorationProps = SVGProps<SVGSVGElement>;

export function ChristmasStar({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn("text-amber-200", className)}
      {...props}
    >
      <path d="M8 0l1.4 5.2L15 8l-5.6 1.4L8 16l-1.4-6.6L1 8l5.6-2.8z" />
    </svg>
  );
}

/** Three small snowflake dots, loosely clustered — placeholder "snow cluster" stand-in until real art exists. */
export function ChristmasSnowCluster({ className, ...props }: DecorationProps) {
  return (
    <svg
      viewBox="0 0 40 20"
      fill="currentColor"
      className={cn("text-slate-100", className)}
      {...props}
    >
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="20" cy="4" r="1.8" />
      <circle cx="33" cy="10" r="2.1" />
    </svg>
  );
}
