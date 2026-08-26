import { describe, expect, it } from "vitest";
import {
  isOccurrenceExpired,
  resolveEventEndingCandidate,
  type EventOccurrenceStatus,
} from "./event-discovery";
import type { EventDefinition } from "@/domain/events/event-definition";

const HALLOWEEN_LIKE: EventDefinition = {
  id: "halloween",
  name: "Halloween",
  availability: {
    startsAt: null,
    endsAt: null,
    recurringMonths: null,
    recurringMonthDayRange: {
      startMonth: 9,
      startDay: 30,
      endMonth: 11,
      endDay: 1,
    },
  },
  draftRules: {},
  eligibilityRules: {},
  intro: { description: "", bullets: [] },
  pointType: "haunted",
  visualTheme: null,
  manualActivationAllowed: false,
  ending: {
    enabled: true,
    message: "It's over.",
    buttonLabel: "Bye.",
  },
};

const NO_ENDING_EVENT: EventDefinition = {
  ...HALLOWEEN_LIKE,
  id: "future-event",
  name: "Future Event",
  ending: undefined,
};

function status(
  overrides: Partial<EventOccurrenceStatus> = {},
): EventOccurrenceStatus {
  return {
    event: HALLOWEEN_LIKE,
    occurrenceKey: "halloween:2026",
    available: false,
    manuallyEnabled: false,
    participation: "joined",
    endingAcknowledged: false,
    ...overrides,
  };
}

describe("isOccurrenceExpired", () => {
  it("true for a joined occurrence that's no longer naturally available and never manually enabled", () => {
    expect(isOccurrenceExpired(status())).toBe(true);
  });

  it("false while still available", () => {
    expect(isOccurrenceExpired(status({ available: true }))).toBe(false);
  });

  it("false for an unjoined occurrence, even if unavailable", () => {
    expect(isOccurrenceExpired(status({ participation: "unanswered" }))).toBe(
      false,
    );
    expect(isOccurrenceExpired(status({ participation: "declined" }))).toBe(
      false,
    );
  });

  it("false when manually enabled — a manual join stays active indefinitely, never 'expires'", () => {
    expect(isOccurrenceExpired(status({ manuallyEnabled: true }))).toBe(false);
  });
});

describe("resolveEventEndingCandidate", () => {
  it("returns the joined, expired, unacknowledged occurrence", () => {
    const candidate = resolveEventEndingCandidate([status()]);
    expect(candidate?.event.id).toBe("halloween");
    expect(candidate?.occurrenceKey).toBe("halloween:2026");
  });

  it("returns null for a declined occurrence", () => {
    expect(
      resolveEventEndingCandidate([status({ participation: "declined" })]),
    ).toBeNull();
  });

  it("returns null for an unanswered (non-participant) occurrence", () => {
    expect(
      resolveEventEndingCandidate([status({ participation: "unanswered" })]),
    ).toBeNull();
  });

  it("returns null while the occurrence is still active (not yet expired)", () => {
    expect(
      resolveEventEndingCandidate([status({ available: true })]),
    ).toBeNull();
  });

  it("returns null once already acknowledged", () => {
    expect(
      resolveEventEndingCandidate([status({ endingAcknowledged: true })]),
    ).toBeNull();
  });

  it("returns null for an event with no ending config at all — a future Event's absent ending config never errors", () => {
    expect(() =>
      resolveEventEndingCandidate([
        status({ event: NO_ENDING_EVENT, occurrenceKey: "future-event:2026" }),
      ]),
    ).not.toThrow();
    expect(
      resolveEventEndingCandidate([
        status({ event: NO_ENDING_EVENT, occurrenceKey: "future-event:2026" }),
      ]),
    ).toBeNull();
  });

  it("returns null for an event whose ending is explicitly disabled", () => {
    const disabled: EventDefinition = {
      ...HALLOWEEN_LIKE,
      ending: { ...HALLOWEEN_LIKE.ending!, enabled: false },
    };
    expect(
      resolveEventEndingCandidate([status({ event: disabled })]),
    ).toBeNull();
  });

  it("a NEW occurrence (a different year) starts fresh, unacknowledged, even if a prior year was already acknowledged", () => {
    const statuses = [
      status({ occurrenceKey: "halloween:2026", endingAcknowledged: true }),
    ];
    expect(resolveEventEndingCandidate(statuses)).toBeNull();

    const nextYear = [
      status({ occurrenceKey: "halloween:2027", endingAcknowledged: false }),
    ];
    expect(resolveEventEndingCandidate(nextYear)?.occurrenceKey).toBe(
      "halloween:2027",
    );
  });
});
