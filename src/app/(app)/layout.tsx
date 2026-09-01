import { AppShell } from "@/components/app-shell";
import { isEventStudioBuild } from "@/lib/event-studio-build";

/**
 * FDraft (Dev)'s data-separation guarantee (see docs/updates, "EVENT
 * STUDIO — PHASE 2" §3) starts here: the real app's only `<AppShell>`
 * mount point. A studio build opens a DIFFERENT Dexie database
 * (`"fdraft-dev"`) than normal FDraft's hardcoded `"fdraft"` default
 * (`FDraftLocalDatabase`'s own constructor default, in
 * `infrastructure/local-db/database.ts`) — belt-and-braces alongside the
 * OS-level isolation `tauri.studio.conf.json`'s distinct `identifier`
 * already gives the packaged Dev app (a separate WebView2 profile
 * entirely, on Windows). This second, code-visible guarantee also covers
 * the case of running the studio-flagged frontend in a plain browser tab
 * for quick iteration (`pnpm run studio:dev-frontend` with no Tauri
 * window at all), where no OS-level isolation exists — the database name
 * itself is still different from whatever a normal `pnpm dev` session on
 * the same machine/browser would open.
 */
const STUDIO_DATABASE_NAME = "fdraft-dev";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      databaseName={isEventStudioBuild ? STUDIO_DATABASE_NAME : undefined}
    >
      {children}
    </AppShell>
  );
}
