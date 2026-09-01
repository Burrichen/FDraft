/**
 * ONE decoration seed generated the moment this module first evaluates —
 * i.e. once per real app launch (see docs/updates, "EVENT STUDIO — PHASE
 * 1" §7). A module-level singleton, not React state: React re-renders and
 * client-side navigation never re-evaluate a module's top-level code, so
 * this value is guaranteed stable for the entire session ("navigate away/
 * back in the same application session -> same decoration") and can only
 * ever change on a genuine full reload/relaunch ("relaunch application ->
 * a different valid variation MAY appear") — exactly the two guarantees
 * §7 asks for, with no extra plumbing (no context provider, no effect)
 * needed to keep it stable.
 *
 * `crypto.randomUUID()` is available in every environment FDraft runs in
 * (browser, Tauri's webview) — no polyfill needed. Consumed by
 * `EventThemeLayoutRenderer` as the `sessionSeed` input to
 * `resolveFDraftThemeLayout`; nothing about this value is ever persisted.
 */
export const THEME_SESSION_SEED: string = crypto.randomUUID();
