import { describe, expect, it } from "vitest";
import { parseHalloweenManifest } from "./halloween-manifest-schema";
import bundledManifestJson from "./manifests/halloween.json";

describe("parseHalloweenManifest", () => {
  it("accepts a well-formed manifest", () => {
    const result = parseHalloweenManifest({
      schemaVersion: 1,
      event: "halloween",
      updatedAt: "2026-08-23T00:00:00.000Z",
      horror: [{ title: "Halloween", year: 1978, tmdbId: "138843" }],
      kitsch: [{ title: "Hocus Pocus" }],
    });
    expect(result).not.toBeNull();
    expect(result?.horror).toHaveLength(1);
    expect(result?.kitsch).toHaveLength(1);
  });

  it("accepts the bundled fallback manifest", () => {
    const result = parseHalloweenManifest(bundledManifestJson);
    expect(result).not.toBeNull();
    expect(result?.horror.length).toBeGreaterThan(0);
    expect(result?.kitsch.length).toBeGreaterThan(0);
  });

  it("rejects the wrong event id", () => {
    expect(
      parseHalloweenManifest({
        schemaVersion: 1,
        event: "f-you-its-january",
        updatedAt: "2026-08-23T00:00:00.000Z",
        horror: [],
        kitsch: [],
      }),
    ).toBeNull();
  });

  it("rejects a missing title", () => {
    expect(
      parseHalloweenManifest({
        schemaVersion: 1,
        event: "halloween",
        updatedAt: "2026-08-23T00:00:00.000Z",
        horror: [{ year: 1978 }],
        kitsch: [],
      }),
    ).toBeNull();
  });

  it("rejects a wrong schema version", () => {
    expect(
      parseHalloweenManifest({
        schemaVersion: 2,
        event: "halloween",
        updatedAt: "2026-08-23T00:00:00.000Z",
        horror: [],
        kitsch: [],
      }),
    ).toBeNull();
  });

  it("never throws on garbage input", () => {
    expect(parseHalloweenManifest(null)).toBeNull();
    expect(parseHalloweenManifest(undefined)).toBeNull();
    expect(parseHalloweenManifest("not an object")).toBeNull();
    expect(parseHalloweenManifest(42)).toBeNull();
    expect(parseHalloweenManifest([])).toBeNull();
  });
});
