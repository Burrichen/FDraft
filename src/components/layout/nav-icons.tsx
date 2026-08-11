import type { SVGProps } from "react";

/**
 * Custom, per-element-animatable stand-ins for the plain `lucide-react`
 * icons the primary nav used before (see docs/product-spec.md's UI-polish
 * pass, "NAVIGATION MICRO-ANIMATIONS"). Lucide ships each of these as a
 * single flat list of `<path>`s with no hook for animating just one part
 * of the glyph (the clapperboard's upper arm, one bar of a chart, ...), so
 * these rebuild the exact same paths — copied directly from
 * `lucide-react`'s `list-video`, `clapperboard`, `rotate-ccw-clock` (the
 * icon `History` re-exports), and `chart-column` (`BarChart3`) sources, so
 * they render pixel-identical at rest — with the specific sub-elements
 * that move tagged with the `nav-icon-*` classes `globals.css`'s
 * `@media (prefers-reduced-motion: no-preference)` block targets.
 *
 * Every prop passes straight to the root `<svg>`, so callers use these
 * exactly like a `lucide-react` icon (`<DraftsNavIcon aria-hidden
 * className="size-4" />`).
 */
type NavIconProps = SVGProps<SVGSVGElement>;

function svgDefaults(props: NavIconProps): NavIconProps {
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

/** Rows briefly slide into alignment on hover/focus — see `.nav-icon-watchlist-row-1/2` in globals.css. */
export function WatchlistNavIcon(props: NavIconProps) {
  return (
    <svg {...svgDefaults(props)}>
      <path d="M21 5H3" />
      <path className="nav-icon-watchlist-row-1" d="M10 12H3" />
      <path className="nav-icon-watchlist-row-2" d="M10 19H3" />
      <path d="M15 12.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z" />
    </svg>
  );
}

/** The upper clapper arm raises, snaps down, and settles on hover/focus — see `.nav-icon-clapperboard-arm` in globals.css. The body box never moves, only the arm. */
export function DraftsNavIcon(props: NavIconProps) {
  return (
    <svg {...svgDefaults(props)}>
      <g className="nav-icon-clapperboard-arm">
        <path d="m12.296 3.464 3.02 3.956" />
        <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z" />
        <path d="m6.18 5.276 3.1 3.899" />
      </g>
      {/* No animation class here, deliberately — the body/base box never moves, only the arm above. */}
      <path
        className="nav-icon-clapperboard-body"
        d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
      />
    </svg>
  );
}

/** The clock hand rewinds a short distance and springs back on hover/focus — see `.nav-icon-history-hand` in globals.css. The dial and its counter-clockwise arrow stay put. */
export function HistoryNavIcon(props: NavIconProps) {
  return (
    <svg {...svgDefaults(props)}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path className="nav-icon-history-hand" d="M12 7v5l4 2" />
    </svg>
  );
}

/** Each bar dips and resettles in a short stagger, like a chart recalculating, on hover/focus — see `.nav-icon-stats-bar-1/2/3` in globals.css. */
export function StatsNavIcon(props: NavIconProps) {
  return (
    <svg {...svgDefaults(props)}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path className="nav-icon-stats-bar nav-icon-stats-bar-1" d="M18 17V9" />
      <path className="nav-icon-stats-bar nav-icon-stats-bar-2" d="M13 17V5" />
      <path className="nav-icon-stats-bar nav-icon-stats-bar-3" d="M8 17v-3" />
    </svg>
  );
}
