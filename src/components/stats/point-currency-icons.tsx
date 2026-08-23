import type { SVGProps } from "react";

/**
 * Hand-authored icons for the Stats page's permanent point currencies
 * (see docs/updates, "PROMPT B2.2 — HALLOWEEN PAGE REBUILD + DEADLINE +
 * STATS" §6) — never emoji, and never the Halloween nav pumpkin reused
 * for every Halloween concept (that would read as repetitive; see the
 * prompt's own note). Same 24×24 stroke-only convention as
 * `src/components/layout/nav-icons.tsx`, just scoped to this page instead
 * of navigation.
 */
type PointIconProps = SVGProps<SVGSVGElement>;

function svgDefaults(props: PointIconProps): PointIconProps {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

/**
 * Haunted Points — a simple, kitsch ghost silhouette (rounded head, a
 * wavy hem instead of straight-cut legs, two dot eyes) rather than the
 * Halloween nav tab's jack-o'-lantern, so the currency reads as its own
 * distinct concept.
 */
export function HauntedPointsIcon(props: PointIconProps) {
  return (
    <svg {...svgDefaults(props)}>
      <path d="M6 20V11a6 6 0 0 1 12 0v9l-2.5-2-2 2-1.5-1.5-1.5 1.5-2-2z" />
      <circle cx="9.5" cy="11" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Misery Points — a small raincloud (see docs/updates §"VISUAL
 * IDENTITIES": "January-specific miserable iconography").
 */
export function MiseryPointsIcon(props: PointIconProps) {
  return (
    <svg {...svgDefaults(props)}>
      <path d="M6.5 16a4 4 0 0 1 .5-7.97A5.5 5.5 0 0 1 17.5 10 4 4 0 0 1 17 16z" />
      <path d="M9 19v1" />
      <path d="M12.5 19v1" />
      <path d="M16 19v1" />
    </svg>
  );
}
