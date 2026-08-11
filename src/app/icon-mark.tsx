import type { ReactElement } from "react";

/**
 * Shared glyph for every generated app icon (browser tab favicon, Apple
 * touch icon, and the PWA manifest's installable icons — see
 * `icon.tsx`, `apple-icon.tsx`, `icon-192.png/route.tsx`,
 * `icon-512.png/route.tsx`, `icon-512-maskable.png/route.tsx`). Reuses the
 * exact same glyph as the in-app header logo (`lucide-react`'s
 * `Clapperboard`, see `src/components/layout/header.tsx`) rather than a
 * separately designed mark, and an sRGB approximation of the app's own
 * `--watchlist-green` design token (`oklch(0.75 0.16 150)` in
 * `globals.css`) — Satori, the renderer behind `next/og`'s `ImageResponse`,
 * doesn't understand `oklch()`, only hex/rgb. Per docs/product-spec.md
 * Prompt 9.5D, "PWA / OFFLINE APPLICATION SHELL": icons generated from
 * assets already in this project, not fetched from an external favicon
 * generator.
 */
export const BRAND_GREEN = "#55c975";

const CLAPPERBOARD_PATHS = [
  "m12.296 3.464 3.02 3.956",
  "M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z",
  "M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  "m6.18 5.276 3.1 3.899",
];

/**
 * Renders the brand mark at a given pixel size for `ImageResponse`. `padded`
 * leaves extra margin around the glyph — needed for a maskable icon, whose
 * content must stay within an inner "safe zone" or Android/iOS crop it when
 * applying their own shape mask on top.
 */
export function renderIconMark(
  size: number,
  options: { rounded?: boolean; padded?: boolean } = {},
): ReactElement {
  const { rounded = true, padded = false } = options;
  const glyphSize = padded ? size * 0.55 : size * 0.72;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_GREEN,
        borderRadius: rounded ? size * 0.22 : 0,
      }}
    >
      <svg
        width={glyphSize}
        height={glyphSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0a1f14"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {CLAPPERBOARD_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>
  );
}
