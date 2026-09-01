import { useEffect, useRef } from "react";
import { setStudioAutosave } from "@/application/event-studio/studio-autosave-store";
import type { FDraftThemeFile } from "@/domain/event-themes/fdraft-theme-schema";
import type { Repositories } from "@/repositories";

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * Event Studio's background autosave (see docs/updates, "EVENT STUDIO —
 * PHASE 6" §1) — debounced so it never writes on every keystroke/drag
 * pixel, only `AUTOSAVE_DEBOUNCE_MS` after edits go quiet, and only while
 * there's something genuinely unsaved (`dirty`) to protect. Writes into
 * the SEPARATE `studio-autosave-store.ts` slot — never the deliberate
 * Save slot — so autosaving never fakes a "Saved" state the user didn't
 * ask for.
 */
export function useStudioAutosave(params: {
  repositories: Repositories;
  profileId: string | null;
  presetId: string;
  theme: FDraftThemeFile | null;
  dirty: boolean;
  enabled: boolean;
  /** Overridable only for tests — production always uses `AUTOSAVE_DEBOUNCE_MS`. */
  debounceMs?: number;
}): void {
  const {
    repositories,
    profileId,
    presetId,
    theme,
    dirty,
    enabled,
    debounceMs = AUTOSAVE_DEBOUNCE_MS,
  } = params;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !profileId || !theme || !dirty) {
      return;
    }
    timerRef.current = setTimeout(() => {
      void setStudioAutosave(repositories, profileId, presetId, theme);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, profileId, presetId, theme, dirty, repositories, debounceMs]);
}
