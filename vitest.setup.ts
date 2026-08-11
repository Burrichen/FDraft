import "@testing-library/jest-dom/vitest";
// Local-first persistence (src/infrastructure/local-db) runs on IndexedDB,
// which jsdom does not implement. This polyfills `indexedDB`/`IDBKeyRange`
// globally for the whole unit suite — harmless for tests that never touch
// it, required for any that do (see docs/product-spec.md, "Local Database").
import "fake-indexeddb/auto";
