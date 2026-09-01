import { downloadTextFile } from "@/lib/download-file";
import type { FDraftThemeFile } from "@/domain/event-themes/fdraft-theme-schema";

/** "Export to File..." (EVENT STUDIO — PHASE 6 §7/§8/§13) — the theme, pretty-printed, saved as a local `.fdraft-theme` download via the same Blob+anchor mechanism every other FDraft export already uses. */
export function downloadThemeFile(
  theme: FDraftThemeFile,
  filename: string,
): void {
  downloadTextFile(
    filename,
    JSON.stringify(theme, null, 2),
    "application/json",
  );
}
