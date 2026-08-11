import { describe, expect, it } from "vitest";
import { draftConfigInputSchema, timezoneSchema } from "./schemas";

describe("draftConfigInputSchema", () => {
  it("accepts a valid Medium split with decide-for-me challenges", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "medium",
      timeMode: "calendar",
      randomCount: 4,
      challengeCount: 6,
      challengeMode: "decide",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a split that does not sum to the difficulty's film count", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "medium",
      timeMode: "calendar",
      randomCount: 4,
      challengeCount: 4,
      challengeMode: "decide",
    });
    expect(result.success).toBe(false);
  });

  it("requires randomCount/challengeCount for non-freeform difficulties", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "baby",
      timeMode: "timer",
    });
    expect(result.success).toBe(false);
  });

  it("does not require a split for freeform", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "freeform",
      timeMode: "timer",
    });
    expect(result.success).toBe(true);
  });

  it("requires a challengeMode when challengeCount > 0", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "easy",
      timeMode: "calendar",
      randomCount: 4,
      challengeCount: 4,
    });
    expect(result.success).toBe(false);
  });

  it("allows omitting challengeMode when challengeCount is 0", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "easy",
      timeMode: "calendar",
      randomCount: 8,
      challengeCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("requires chosenChallengeIds when challengeMode is 'choose'", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "easy",
      timeMode: "calendar",
      randomCount: 4,
      challengeCount: 4,
      challengeMode: "choose",
    });
    expect(result.success).toBe(false);
  });

  it("accepts 'choose' mode with exactly one chosen challenge per slot", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "easy",
      timeMode: "calendar",
      randomCount: 4,
      challengeCount: 4,
      challengeMode: "choose",
      chosenChallengeIds: [
        "short-king",
        "the-eldest",
        "crown-jewel",
        "passport-control",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects 'choose' mode with fewer chosen challenges than challenge slots", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "easy",
      timeMode: "calendar",
      randomCount: 4,
      challengeCount: 4,
      challengeMode: "choose",
      chosenChallengeIds: ["short-king"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects 'choose' mode with more chosen challenges than challenge slots", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "easy",
      timeMode: "calendar",
      randomCount: 4,
      challengeCount: 4,
      challengeMode: "choose",
      chosenChallengeIds: [
        "short-king",
        "the-eldest",
        "crown-jewel",
        "passport-control",
        "weeb",
      ],
    });
    expect(result.success).toBe(false);
  });

  it("allows the same challenge id chosen more than once across slots", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "baby",
      timeMode: "calendar",
      randomCount: 0,
      challengeCount: 5,
      challengeMode: "choose",
      chosenChallengeIds: [
        "short-king",
        "short-king",
        "short-king",
        "short-king",
        "short-king",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an optional manualGenre alongside a chosen Genre Roulette pick", () => {
    const result = draftConfigInputSchema.safeParse({
      difficulty: "baby",
      timeMode: "calendar",
      randomCount: 4,
      challengeCount: 1,
      challengeMode: "choose",
      chosenChallengeIds: ["genre-roulette"],
      manualGenre: "Horror",
    });
    expect(result.success).toBe(true);
  });
});

describe("timezoneSchema", () => {
  it("accepts UTC", () => {
    expect(timezoneSchema.safeParse("UTC").success).toBe(true);
  });

  it("accepts a standard IANA zone", () => {
    expect(timezoneSchema.safeParse("Europe/London").success).toBe(true);
    expect(
      timezoneSchema.safeParse("America/Argentina/Buenos_Aires").success,
    ).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(timezoneSchema.safeParse("").success).toBe(false);
  });

  it("rejects a non-timezone string", () => {
    expect(timezoneSchema.safeParse("not a timezone").success).toBe(false);
  });
});
