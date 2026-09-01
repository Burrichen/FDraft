/**
 * The ONE central build/runtime capability flag distinguishing FDraft
 * (Dev) — the Event Studio build — from normal FDraft (see docs/updates,
 * "EVENT STUDIO — PHASE 2" §1). Both applications share every page,
 * domain module, the Event system, the `.fdraft-theme` schema, and the
 * production `EventThemeLayoutRenderer` verbatim; this flag is the ONLY
 * thing that turns on the small set of Dev-only surfaces layered on top
 * (the Event Studio entry point, the Event Art Workspace setting, the
 * Copy/Import test-data action) — never a scattered
 * `productName === "FDraft (Dev)"` check re-derived in a dozen places.
 *
 * Backed by `NEXT_PUBLIC_EVENT_STUDIO`, set to `"1"` only when the
 * frontend is started/built for the Dev target — see
 * `scripts/studio-dev-frontend.ts` (dev server) and
 * `build-desktop-frontend.ts --studio` (static export), both wired as
 * `tauri.studio.conf.json`'s own `beforeDevCommand`/`beforeBuildCommand`
 * (merged in via `tauri ... --config src-tauri/tauri.studio.conf.json`,
 * see `package.json`'s `studio:dev`/`studio:build`). `NEXT_PUBLIC_*`
 * variables are inlined at build time by Next.js, so this constant is a
 * genuine compile-time flag — a normal FDraft build has this permanently
 * `false` baked into its bundle, not a runtime toggle a user could ever
 * flip.
 *
 * A normal (non-Tauri) `pnpm dev`/`pnpm build` — the ordinary web target
 * — never sets this either, so Event Studio surfaces are exactly as
 * absent from the plain web build as they are from packaged normal
 * FDraft.
 */
export const isEventStudioBuild: boolean =
  process.env.NEXT_PUBLIC_EVENT_STUDIO === "1";
