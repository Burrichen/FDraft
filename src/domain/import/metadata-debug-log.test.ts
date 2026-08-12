import { describe, expect, it } from "vitest";
import { formatMetadataResolutionLog } from "./metadata-debug-log";

describe("formatMetadataResolutionLog", () => {
  it("formats a matched decision with the full candidate trail", () => {
    const output = formatMetadataResolutionLog({
      importedTitle: "Jacob's Ladder",
      importedYear: 1990,
      candidates: [
        { title: "Jacob's Ladder", year: 1990, score: 0.99 },
        { title: "Jacob's Ladder", year: 2019, score: 0.72 },
      ],
      decision: "matched",
      providerId: "8846",
    });
    expect(output).toBe(
      [
        "[MetadataResolution]",
        'importedTitle="Jacob\'s Ladder"',
        "importedYear=1990",
        "",
        "candidateCount=2",
        "",
        "candidate[0]:",
        'title="Jacob\'s Ladder"',
        "year=1990",
        "score=0.99",
        "",
        "candidate[1]:",
        'title="Jacob\'s Ladder"',
        "year=2019",
        "score=0.72",
        "",
        "decision=matched",
        "providerId=8846",
      ].join("\n"),
    );
  });

  it("formats an unresolved decision with its structured reason, never a generic 'no match'", () => {
    const output = formatMetadataResolutionLog({
      importedTitle: "Some Obscure Film",
      importedYear: 2010,
      candidates: [],
      decision: "unresolved",
      providerId: "tmdb",
      reason: "no_candidates",
    });
    expect(output).toContain("candidateCount=0");
    expect(output).toContain("decision=unresolved");
    expect(output).toContain("reason=no_candidates");
    expect(output).not.toMatch(/reason=no match/i);
  });

  it("formats the ambiguous case with its own specific reason", () => {
    const output = formatMetadataResolutionLog({
      importedTitle: "Doubt",
      importedYear: 2008,
      candidates: [
        { title: "Doubt", year: 2008, score: 0.7 },
        { title: "Doubt", year: 2008, score: 0.68 },
      ],
      decision: "unresolved",
      reason: "multiple_high_confidence_candidates",
    });
    expect(output).toContain("reason=multiple_high_confidence_candidates");
  });

  it("formats a failed decision with a technical reason and no candidate trail expected", () => {
    const output = formatMetadataResolutionLog({
      importedTitle: "",
      decision: "failed",
      reason: "missing_import_title",
    });
    expect(output).toContain("decision=failed");
    expect(output).toContain("reason=missing_import_title");
    expect(output).toContain("candidateCount=0");
  });

  it("caps candidate count reporting at whatever list is actually passed — never fabricates extra candidates", () => {
    const output = formatMetadataResolutionLog({
      importedTitle: "Anything",
      candidates: [],
      decision: "manual-search",
    });
    expect(output).toContain("candidateCount=0");
    expect(output).not.toContain("candidate[0]");
  });

  it("never includes anything resembling an api key or secret field", () => {
    const output = formatMetadataResolutionLog({
      importedTitle: "Example",
      candidates: [{ title: "Example", year: 2020, score: 1 }],
      decision: "matched",
      providerId: "123",
    });
    expect(output.toLowerCase()).not.toContain("key");
    expect(output.toLowerCase()).not.toContain("token");
    expect(output.toLowerCase()).not.toContain("secret");
  });
});
