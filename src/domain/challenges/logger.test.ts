import { describe, expect, it } from "vitest";
import { formatChallengeAttemptLog } from "./logger";

describe("formatChallengeAttemptLog", () => {
  it("formats a skipped/ineligible attempt with its reason", () => {
    const output = formatChallengeAttemptLog({
      challengeId: "prestige-pick",
      status: "ineligible",
      attemptNumber: 1,
      reason: "no_films_rating_gte_4",
    });
    expect(output).toBe(
      [
        "[DraftChallenge]",
        "challenge=prestige-pick",
        "status=ineligible",
        "attempt=1",
        "reason=no_films_rating_gte_4",
      ].join("\n"),
    );
  });

  it("formats a successful attempt with the selected film id and no reason line", () => {
    const output = formatChallengeAttemptLog({
      challengeId: "short-king",
      status: "success",
      attemptNumber: 2,
      selectedFilmId: "film-123",
    });
    expect(output).toContain("status=success");
    expect(output).toContain("film=film-123");
    expect(output).not.toContain("reason=");
  });
});
