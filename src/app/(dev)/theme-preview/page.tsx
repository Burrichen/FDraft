import { notFound } from "next/navigation";
import { ThemePreviewClient } from "./theme-preview-client";

/**
 * Development-only theme preview screen (see docs/updates, "FDRAFT THEME
 * RUNTIME — PROMPT 10"). Lives outside the `(app)` route group deliberately
 * — no `AppShell` chrome, a standalone screen for inspecting one theme
 * package. The route itself 404s the moment `NODE_ENV === "production"`
 * (checked server-side, before any client code runs) — belt-and-braces
 * alongside `theme-preview-server.ts`'s own production refusal, so this
 * page is genuinely excluded from ordinary release operation, not merely
 * hidden behind an inert client component.
 */
export default function ThemePreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <ThemePreviewClient />;
}
