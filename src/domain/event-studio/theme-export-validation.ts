import { fdraftThemeSchema } from "@/domain/event-themes/fdraft-theme-schema";

/**
 * Export Validation (EVENT STUDIO — PHASE 6 §10) — runs the theme
 * through the EXACT SAME schema every other consumer (`theme-apply.ts`,
 * Beta Admin Preview Import, the production renderer) validates against,
 * so "✓ Ready to export" here really does mean those consumers will
 * accept the file too (§9's "no conversion step" guarantee only holds if
 * export-time validation and consumption-time validation are the same
 * check). Reports EVERY issue (not just the first, unlike
 * `parseFDraftThemeText`'s text-input error, which only needs to explain
 * one JSON parse failure to a human at a time) since a useful pre-export
 * report should show the user everything that needs fixing at once.
 */
export interface ThemeValidationIssue {
  /** Dotted/bracketed path into the theme, e.g. `layouts.eventPage.states.default.breakpoints.desktop.placements[2].assetId`. */
  path: string;
  message: string;
}

export interface ThemeValidationResult {
  ok: boolean;
  issues: ThemeValidationIssue[];
}

export function validateThemeForExport(theme: unknown): ThemeValidationResult {
  const result = fdraftThemeSchema.safeParse(theme);
  if (result.success) {
    return { ok: true, issues: [] };
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      message: issue.message,
    })),
  };
}
