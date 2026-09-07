import { describe, expect, it } from "vitest";
import { formatOneAtATimeSourceLabel } from "./format-one-at-a-time-source-label";

describe("formatOneAtATimeSourceLabel (FDRAFT UPDATE 1 — EVENT ONE AT A TIME DRAFTING)", () => {
  it("reproduces the exact normal-flow labels with no category", () => {
    expect(
      formatOneAtATimeSourceLabel({
        source: "random",
        challengeId: null,
        challengeName: null,
      }),
    ).toBe("Random");
    expect(
      formatOneAtATimeSourceLabel({
        source: "manual",
        challengeId: null,
        challengeName: null,
      }),
    ).toBe("Chosen");
    expect(
      formatOneAtATimeSourceLabel({
        source: "challenge",
        challengeId: "the-eldest",
        challengeName: "The Eldest",
      }),
    ).toBe("Challenge: The Eldest");
  });

  it("falls back to the raw challenge id when no name is known", () => {
    expect(
      formatOneAtATimeSourceLabel({
        source: "challenge",
        challengeId: "the-eldest",
        challengeName: null,
      }),
    ).toBe("Challenge: the-eldest");
  });

  it("prefixes the category label for a category-based Event item (§14)", () => {
    expect(
      formatOneAtATimeSourceLabel({
        source: "random",
        challengeId: null,
        challengeName: null,
        categoryLabel: "Horror",
      }),
    ).toBe("Horror · Random");
    expect(
      formatOneAtATimeSourceLabel({
        source: "manual",
        challengeId: null,
        challengeName: null,
        categoryLabel: "Kitsch",
      }),
    ).toBe("Kitsch · Chosen");
    expect(
      formatOneAtATimeSourceLabel({
        source: "challenge",
        challengeId: "the-eldest",
        challengeName: "The Eldest",
        categoryLabel: "Horror",
      }),
    ).toBe("Horror · Challenge: The Eldest");
  });

  it("omits the category prefix for January (no category)", () => {
    expect(
      formatOneAtATimeSourceLabel({
        source: "random",
        challengeId: null,
        challengeName: null,
        categoryLabel: null,
      }),
    ).toBe("Random");
  });
});
