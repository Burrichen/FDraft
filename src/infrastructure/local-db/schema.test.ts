import Dexie, { type Transaction } from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { applySchema, SCHEMA_MIGRATIONS, SCHEMA_VERSION } from "./schema";

describe("SCHEMA_VERSION", () => {
  it("is derived from the last entry in SCHEMA_MIGRATIONS, not a separate hardcoded constant", () => {
    expect(SCHEMA_VERSION).toBe(SCHEMA_MIGRATIONS.at(-1)!.version);
  });

  it("SCHEMA_MIGRATIONS is a non-empty, version-ordered list starting at 1", () => {
    expect(SCHEMA_MIGRATIONS.length).toBeGreaterThan(0);
    expect(SCHEMA_MIGRATIONS[0].version).toBe(1);
    for (let i = 1; i < SCHEMA_MIGRATIONS.length; i++) {
      expect(SCHEMA_MIGRATIONS[i].version).toBe(
        SCHEMA_MIGRATIONS[i - 1].version + 1,
      );
    }
  });
});

describe("applySchema — migration mechanism (synthetic schema, independent of the app's real tables)", () => {
  const dbNames: string[] = [];

  afterEach(async () => {
    await Promise.all(dbNames.splice(0).map((name) => Dexie.delete(name)));
  });

  it("opens a fresh database at the latest declared version", async () => {
    const name = `schema-test-${crypto.randomUUID()}`;
    dbNames.push(name);
    const db = new Dexie(name);
    applySchemaVersions(db, [{ version: 1, stores: { widgets: "id, name" } }]);
    await db.open();
    expect(db.verno).toBe(1);
    await db.close();
  });

  it("upgrades an existing database across multiple versions, preserving and transforming data", async () => {
    const name = `schema-test-${crypto.randomUUID()}`;
    dbNames.push(name);

    // Simulate "version 1 shipped a while ago" by opening a database at v1 first.
    const v1 = new Dexie(name);
    applySchemaVersions(v1, [{ version: 1, stores: { widgets: "id, name" } }]);
    await v1.open();
    await v1.table("widgets").add({ id: "w1", name: "Widget One" });
    await v1.close();

    // A later release adds a `label` field, backfilled from `name` for
    // existing rows — the same shape a real SCHEMA_MIGRATIONS entry's
    // `upgrade` callback would take.
    const v2 = new Dexie(name);
    applySchemaVersions(v2, [
      { version: 1, stores: { widgets: "id, name" } },
      {
        version: 2,
        stores: { widgets: "id, name, label" },
        upgrade: async (tx) => {
          await tx
            .table("widgets")
            .toCollection()
            .modify((widget: { name: string; label?: string }) => {
              widget.label = widget.name.toUpperCase();
            });
        },
      },
    ]);
    await v2.open();
    expect(v2.verno).toBe(2);

    const migrated = await v2.table("widgets").get("w1");
    expect(migrated).toEqual({
      id: "w1",
      name: "Widget One",
      label: "WIDGET ONE",
    });
    await v2.close();
  });

  it("v2 -> v3 -> v4 dedupes any unresolvedMetadata rows an install already accumulated under the old [filmId+provider] key, keeping the most recently attempted one per film, then tightens filmId to a unique index", async () => {
    const name = `schema-test-${crypto.randomUUID()}`;
    dbNames.push(name);

    // Simulate "this install already has FDraft's real v1+v2 schema,
    // with the exact bug this migration fixes: two rows for one film
    // under two different provider labels."
    const v2 = new Dexie(name);
    applySchemaVersions(v2, SCHEMA_MIGRATIONS.slice(0, 2));
    await v2.open();
    await v2.table("unresolvedMetadata").bulkAdd([
      {
        id: "row-1",
        filmId: "film-1",
        provider: "unknown",
        status: "failed",
        reason: "network-error",
        message: "Could not reach the metadata provider.",
        lastAttemptedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "row-2",
        filmId: "film-1",
        provider: "tmdb",
        status: "failed",
        reason: "rate-limited",
        message: "The metadata provider rate-limited this request.",
        lastAttemptedAt: "2026-01-02T00:00:00.000Z",
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    await v2.close();

    // Jumping straight from v2 to the latest declared version (v4) in one
    // open — as a real returning user's browser would — must run v3's
    // dedupe BEFORE v4's unique-index tightening is applied, or the
    // ConstraintError this test guards against would resurface.
    const latest = new Dexie(name);
    applySchema(latest);
    await latest.open();
    expect(latest.verno).toBe(SCHEMA_VERSION);

    const rows = await latest.table("unresolvedMetadata").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      filmId: "film-1",
      provider: "tmdb",
      reason: "rate-limited",
    });
    await latest.close();
  });

  it("the real app schema opens cleanly end to end (integration smoke test of applySchema itself)", async () => {
    const name = `schema-test-${crypto.randomUUID()}`;
    dbNames.push(name);
    const db = new Dexie(name);
    applySchema(db);
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect(db.tables.map((table) => table.name).sort()).toEqual(
      [
        "draftChallengeAttempts",
        "draftChallengeInteractions",
        "draftItems",
        "draftPostmortemResponses",
        "drafts",
        "filmMetadata",
        "films",
        "pointBalances",
        "profiles",
        "selectionWeightAdjustments",
        "settings",
        "unresolvedMetadata",
        "userRatings",
        "watchedHistory",
        "watchlistEntries",
        "watchlistImports",
      ].sort(),
    );
    await db.close();
  });
});

function applySchemaVersions(
  db: Dexie,
  versions: {
    version: number;
    stores: Record<string, string>;
    upgrade?: (tx: Transaction) => Promise<void> | void;
  }[],
): void {
  for (const migration of versions) {
    const versioned = db.version(migration.version).stores(migration.stores);
    if (migration.upgrade) {
      versioned.upgrade(migration.upgrade);
    }
  }
}
