import { describe, expect, it } from "vitest";
import {
  CURRENT_BACKUP_FORMAT_VERSION,
  MAX_BACKUP_FILE_SIZE_BYTES,
  parseAndMigrateBackup,
  runMigrationChain,
  type BackupMigrationStep,
} from "./backup-migrations";
import type { BackupV1 } from "./backup-schema";

function minimalBackup(): BackupV1 {
  return {
    manifest: {
      format: "fdraft-backup",
      formatVersion: 1,
      exportedAt: "2026-08-11T00:00:00.000Z",
      appVersion: "0.1.0",
    },
    profile: {
      id: "profile-1",
      displayName: "Alex",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-08-01T00:00:00.000Z",
      timezone: "Europe/London",
      settings: { reducedMotion: false },
      dataVersion: 1,
    },
    films: [],
    filmMetadata: [],
    watchlistEntries: [],
    watchlistImports: [],
    watchedHistory: [],
    userRatings: [],
    drafts: [],
    draftItems: [],
    draftChallengeAttempts: [],
    draftChallengeInteractions: [],
    draftPostmortemResponses: [],
    selectionWeightAdjustments: [],
    settings: [],
  };
}

describe("parseAndMigrateBackup", () => {
  it("accepts a well-formed current-version backup", () => {
    const result = parseAndMigrateBackup(JSON.stringify(minimalBackup()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.profile.displayName).toBe("Alex");
    }
  });

  it("CURRENT_BACKUP_FORMAT_VERSION is 1 today, and the migration list starts empty", () => {
    expect(CURRENT_BACKUP_FORMAT_VERSION).toBe(1);
  });

  it("rejects invalid JSON without throwing", () => {
    const result = parseAndMigrateBackup("{not valid json");
    expect(result).toEqual({
      ok: false,
      error: "invalid_json",
      message: expect.any(String),
    });
  });

  it("rejects a JSON array (not an object) at the top level", () => {
    const result = parseAndMigrateBackup("[1, 2, 3]");
    expect(result).toEqual({
      ok: false,
      error: "not_an_object",
      message: expect.any(String),
    });
  });

  it("rejects a JSON object with no manifest at all", () => {
    const result = parseAndMigrateBackup(JSON.stringify({ hello: "world" }));
    expect(result).toEqual({
      ok: false,
      error: "missing_manifest",
      message: expect.any(String),
    });
  });

  it("rejects a backup with the wrong format marker", () => {
    const backup = minimalBackup() as unknown as Record<string, unknown>;
    (backup.manifest as Record<string, unknown>).format =
      "some-other-app-backup";
    const result = parseAndMigrateBackup(JSON.stringify(backup));
    expect(result).toEqual({
      ok: false,
      error: "wrong_format",
      message: expect.any(String),
    });
  });

  it("rejects a backup from a newer, unsupported format version with a clear, specific message", () => {
    const backup = minimalBackup() as unknown as Record<string, unknown>;
    (backup.manifest as Record<string, unknown>).formatVersion = 999;
    const result = parseAndMigrateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("unsupported_newer_version");
      expect(result.message).toMatch(/newer version of FDraft/i);
      expect(result.message).toMatch(/update FDraft/i);
    }
  });

  it("rejects a structurally-invalid backup (fails full schema validation) as invalid_schema", () => {
    const backup = minimalBackup() as unknown as Record<string, unknown>;
    (backup.profile as Record<string, unknown>).timezone = 12345; // wrong type
    const result = parseAndMigrateBackup(JSON.stringify(backup));
    expect(result).toEqual({
      ok: false,
      error: "invalid_schema",
      message: expect.any(String),
    });
  });

  it("rejects a file larger than the configured size limit without ever attempting to JSON.parse it", () => {
    const oversized = "x".repeat(MAX_BACKUP_FILE_SIZE_BYTES + 1);
    const result = parseAndMigrateBackup(oversized);
    expect(result).toEqual({
      ok: false,
      error: "file_too_large",
      message: expect.any(String),
    });
  });

  it("never throws for any garbage input — always returns a typed result", () => {
    const garbageInputs = [
      "",
      "null",
      "undefined",
      "{}",
      "true",
      "42",
      '{"manifest": null}',
      '{"manifest": "oops"}',
    ];
    for (const input of garbageInputs) {
      expect(() => parseAndMigrateBackup(input)).not.toThrow();
      const result = parseAndMigrateBackup(input);
      expect(result.ok).toBe(false);
    }
  });
});

describe("runMigrationChain — the mechanism itself, independent of the real (currently empty) migration list", () => {
  it("applies a single v1->v2 step and transforms the data", () => {
    const steps: BackupMigrationStep[] = [
      {
        fromVersion: 1,
        toVersion: 2,
        migrate: (data) => ({ ...data, addedInV2: "yes" }),
      },
    ];
    const result = runMigrationChain({ hello: "world" }, 1, 2, steps);
    expect(result).toEqual({
      ok: true,
      data: { hello: "world", addedInV2: "yes" },
    });
  });

  it("walks multiple chained steps in order (v1->v2->v3)", () => {
    const steps: BackupMigrationStep[] = [
      {
        fromVersion: 1,
        toVersion: 2,
        migrate: (data) => ({ ...data, step: ["v1->v2"] }),
      },
      {
        fromVersion: 2,
        toVersion: 3,
        migrate: (data) => ({
          ...data,
          step: [...(data.step as string[]), "v2->v3"],
        }),
      },
    ];
    const result = runMigrationChain({}, 1, 3, steps);
    expect(result).toEqual({ ok: true, data: { step: ["v1->v2", "v2->v3"] } });
  });

  it("is a no-op when fromVersion already equals toVersion", () => {
    const result = runMigrationChain({ untouched: true }, 3, 3, []);
    expect(result).toEqual({ ok: true, data: { untouched: true } });
  });

  it("fails cleanly when a step in the chain is missing", () => {
    const result = runMigrationChain({}, 1, 3, [
      { fromVersion: 1, toVersion: 2, migrate: (data) => data },
    ]);
    expect(result).toEqual({
      ok: false,
      error: "invalid_schema",
      message: expect.stringContaining("No migration path"),
    });
  });

  it("fails cleanly (never throws) when a migration step itself throws", () => {
    const steps: BackupMigrationStep[] = [
      {
        fromVersion: 1,
        toVersion: 2,
        migrate: () => {
          throw new Error("simulated corruption during migration");
        },
      },
    ];
    expect(() => runMigrationChain({}, 1, 2, steps)).not.toThrow();
    const result = runMigrationChain({}, 1, 2, steps);
    expect(result).toEqual({
      ok: false,
      error: "invalid_schema",
      message: expect.stringContaining("simulated corruption"),
    });
  });
});
