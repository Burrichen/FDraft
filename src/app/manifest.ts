import type { MetadataRoute } from "next";

// Required for static export (the desktop/Tauri build — see
// docs/product-spec.md's Tauri integration notes); this manifest has no
// per-request dynamic content at all.
export const dynamic = "force-static";

/**
 * Makes FDraft installable as a Progressive Web App (see
 * docs/product-spec.md, "PWA / OFFLINE APPLICATION SHELL" — Prompt 9.5D).
 * Icons point at the plain PNG-generating routes in `icon-192.png/`,
 * `icon-512.png/`, and `icon-512-maskable.png/` (see those files for why
 * they're regular routes rather than the special `icon.tsx` convention —
 * this array needs a URL it can write down directly). `display:
 * "standalone"` is what actually makes an installed FDraft open in its own
 * window, without a browser address bar, like a native app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FDraft",
    short_name: "FDraft",
    description:
      "A local-first Letterboxd watchlist and Monthly Watchlist Draft companion. No account, works offline.",
    start_url: "/",
    display: "standalone",
    // sRGB approximation of the app's own dark-mode `--background` token
    // (`oklch(0.19 0.006 260)` in globals.css) — the manifest spec wants a
    // plain hex/rgb color, not oklch().
    background_color: "#121316",
    theme_color: "#121316",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
