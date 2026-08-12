/**
 * Decides whether an automatic update check should run right now — pure
 * and Tauri-free so the frequency rule itself (see docs/product-spec.md,
 * "CHECK FREQUENCY": "Do not check excessively... avoid repeated checks
 * within the same short period/session") is unit-testable without a
 * webview. `alreadyCheckedThisSession` catches the same-session case (a
 * remount, a route change) even when `lastCheckedAt` hasn't been persisted
 * yet; `MIN_CHECK_INTERVAL_MS` catches the cross-session case (quitting
 * and relaunching FDraft minutes apart).
 */
export const MIN_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface UpdateCheckPolicyInput {
  autoCheckEnabled: boolean;
  /** ISO 8601, or `null` if a check has never completed. */
  lastCheckedAt: string | null;
  alreadyCheckedThisSession: boolean;
  now: Date;
}

export function shouldAutoCheckForUpdate(
  input: UpdateCheckPolicyInput,
): boolean {
  if (!input.autoCheckEnabled) return false;
  if (input.alreadyCheckedThisSession) return false;
  if (input.lastCheckedAt === null) return true;

  const lastChecked = new Date(input.lastCheckedAt).getTime();
  if (Number.isNaN(lastChecked)) return true;

  return input.now.getTime() - lastChecked >= MIN_CHECK_INTERVAL_MS;
}
