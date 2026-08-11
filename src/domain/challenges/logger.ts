import type { ChallengeAttemptStatus } from "@/repositories";

/**
 * Structured logging for challenge attempts during draft generation (see
 * docs/product-spec.md, "Challenge Architecture" — "[DraftChallenge]"
 * blocks). One place formats these lines so they stay consistent instead of
 * scattered ad hoc console.log calls.
 *
 * `status` intentionally reuses the persisted `challenge_attempt_status` DB
 * enum (success/ineligible/requires_user_choice/failure) rather than the
 * spec example's casual "skipped", so a log line and its corresponding
 * draft_challenge_attempts row always agree on vocabulary.
 */
export interface ChallengeAttemptLogEvent {
  challengeId: string;
  status: ChallengeAttemptStatus;
  attemptNumber: number;
  reason?: string;
  selectedFilmId?: string;
}

export function formatChallengeAttemptLog(
  event: ChallengeAttemptLogEvent,
): string {
  const lines = [
    "[DraftChallenge]",
    `challenge=${event.challengeId}`,
    `status=${event.status}`,
    `attempt=${event.attemptNumber}`,
  ];
  if (event.reason) {
    lines.push(`reason=${event.reason}`);
  }
  if (event.selectedFilmId) {
    lines.push(`film=${event.selectedFilmId}`);
  }
  return lines.join("\n");
}

/** Logs to the console outside production. Persisting attempts for stats/debugging is a separate concern (see draft_challenge_attempts). */
export function logChallengeAttempt(event: ChallengeAttemptLogEvent): void {
  if (process.env.NODE_ENV !== "production") {
    console.log(formatChallengeAttemptLog(event));
  }
}
