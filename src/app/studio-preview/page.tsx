import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioPreviewShell } from "./studio-preview-shell";

export const metadata: Metadata = { title: "Event Studio Preview" };

/**
 * The Event Studio editor workspace's preview target (see docs/updates,
 * "EVENT STUDIO — PHASE 3" §1/§8) — deliberately OUTSIDE the `(app)` route
 * group, so it never inherits `AppShell` (no `Header`, no `UpdateProvider`/
 * `UpdateDialog`, see `(app)/layout.tsx`). `StudioPageClient` embeds this
 * route in an `<iframe>` sized to the selected breakpoint — an iframe,
 * not a scaled wrapper `<div>`, because FDraft's own responsive classes
 * (`sm:`/`lg:`) respond to a real browser viewport width via media
 * queries, which only a genuine nested browsing context reproduces
 * correctly.
 *
 * `useSearchParams()` (used inside `StudioPreviewShell`) requires a
 * Suspense boundary for the static-export desktop build (`output:
 * "export"`, see `next.config.ts`) — this is that boundary.
 */
export default function StudioPreviewPage() {
  return (
    <Suspense fallback={null}>
      <StudioPreviewShell />
    </Suspense>
  );
}
