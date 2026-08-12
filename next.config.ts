import type { NextConfig } from "next";

/**
 * `output: "export"` only for the desktop (Tauri) frontend build — see
 * docs/product-spec.md's Tauri integration notes, "STATIC PRODUCTION
 * FRONTEND". The web build (`pnpm dev`/`pnpm build`) stays a normal
 * Next.js server so its two metadata API routes keep working; those
 * routes are POST handlers that read the request body, which static
 * export fundamentally cannot support (Next only allows static-export
 * Route Handlers to be GET-only) — `scripts/build-desktop-frontend.ts`
 * excludes them from the tree before running this build, since their mere
 * presence fails an export build regardless of whether anything calls
 * them at runtime. `next/image` isn't used anywhere in this app (posters
 * are plain `<img>` tags — see any poster-rendering component), so the
 * export mode's image-optimization limitation never applies.
 */
const isDesktopBuild = process.env.NEXT_PUBLIC_TAURI === "1";

const nextConfig: NextConfig = {
  ...(isDesktopBuild ? { output: "export" } : {}),
};

export default nextConfig;
