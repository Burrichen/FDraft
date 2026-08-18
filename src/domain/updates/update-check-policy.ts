/**
 * Decides whether an automatic update check should run right now — pure
 * and Tauri-free so the policy itself is unit-testable without a webview.
 *
 * Previously also gated on a minimum cross-session interval (6 hours)
 * between checks, on top of the enabled flag and the once-per-session
 * guard. That interval was the actual cause of "automatic checking
 * doesn't work" reports (see docs/updates, v1.0.3 "Now Updating"): a
 * check that ran once — on first install, or from a manual "Check for
 * Updates" click — reset the same shared cooldown, so ANY startup within
 * the next 6 hours silently skipped its own automatic check, even though
 * a new release may have gone out in the meantime. A user relaunching
 * FDraft a few times over an afternoon would only ever find a new
 * version by clicking "Check for Updates" themselves. Requirement: "FDraft
 * should automatically check for updates on startup" — taken literally,
 * every startup. `alreadyCheckedThisSession` alone already prevents
 * redundant re-checks within one running process (a remount, a route
 * change), which is the only case that actually needs guarding against.
 */
export interface UpdateCheckPolicyInput {
  autoCheckEnabled: boolean;
  alreadyCheckedThisSession: boolean;
}

export function shouldAutoCheckForUpdate(
  input: UpdateCheckPolicyInput,
): boolean {
  return input.autoCheckEnabled && !input.alreadyCheckedThisSession;
}
