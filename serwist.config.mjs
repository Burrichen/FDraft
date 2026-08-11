// @ts-check
// Config for the `@serwist/cli` `build` command — see `package.json`'s
// `build` script and docs/product-spec.md, "PWA / OFFLINE APPLICATION
// SHELL" (Prompt 9.5D). This is a build-time-only, separate step from
// `next build` itself: Next.js 16 defaults to Turbopack, and `@serwist/next`'s
// original webpack-plugin integration (`withSerwist` in next.config.ts)
// never runs under Turbopack at all — this "configurator mode" is
// Serwist's own documented Turbopack-compatible alternative. It scans
// `.next`'s build output (including prerendered HTML) after `next build`
// finishes and bundles `src/app/sw.ts` into `public/sw.js` with a real
// precache manifest of that output baked in.
//
// `.mjs`, not `.js` — matches this repo's existing convention for
// ESM-syntax config files in a `package.json` with no `"type": "module"`
// (see `postcss.config.mjs`, `eslint.config.mjs`).
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});
