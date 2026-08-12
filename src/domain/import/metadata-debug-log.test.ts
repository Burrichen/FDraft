import { describe, expect, it } from "vitest";
import { formatMetadataLog } from "./metadata-debug-log";

describe("formatMetadataLog", () => {
  it("formats a matched lookup with the full match trail", () => {
    const output = formatMetadataLog({
      film: "The Thing",
      importYear: 1982,
      query: "The Thing",
      providerCandidates: 4,
      selectedCandidate: "The Thing (1982)",
      confidence: 0.98,
      status: "matched",
    });
    expect(output).toBe(
      [
        "[Metadata]",
        'film="The Thing"',
        "importYear=1982",
        'query="The Thing"',
        "providerCandidates=4",
        'selectedCandidate="The Thing (1982)"',
        "confidence=0.98",
        "status=matched",
      ].join("\n"),
    );
  });

  it("formats a not-found lookup with its reason and no candidate/confidence lines", () => {
    const output = formatMetadataLog({
      film: "Example Film",
      status: "not-found",
      reason: "no-provider-candidates",
    });
    expect(output).toContain("status=not-found");
    expect(output).toContain("reason=no-provider-candidates");
    expect(output).not.toContain("confidence=");
    expect(output).not.toContain("selectedCandidate=");
  });

  it("formats a provider error with the HTTP status", () => {
    const output = formatMetadataLog({
      film: "Example Film",
      status: "provider-error",
      httpStatus: 429,
    });
    expect(output).toContain("status=provider-error");
    expect(output).toContain("httpStatus=429");
  });

  it("never includes anything resembling an api key field", () => {
    const output = formatMetadataLog({
      film: "Example",
      status: "matched",
      confidence: 1,
    });
    expect(output.toLowerCase()).not.toContain("key");
    expect(output.toLowerCase()).not.toContain("token");
  });
});
