import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";
// Local-first persistence (src/infrastructure/local-db) runs on IndexedDB,
// which jsdom does not implement. This polyfills `indexedDB`/`IDBKeyRange`
// globally for the whole unit suite — harmless for tests that never touch
// it, required for any that do (see docs/product-spec.md, "Local Database").
import "fake-indexeddb/auto";

// `usePathname()` degrades gracefully (returns `null`) when no real Next
// App Router is mounted, but `useRouter()` throws an "invariant expected
// app router to be mounted" error instead (see docs/updates, "PROMPT 18 —
// EVENT PAGES + HALLOWEEN LIFECYCLE" — `useEventOptInFlow` calls
// `useRouter()` to navigate to an event's page after opting in). None of
// this unit suite's RTL harnesses mount a real router, so this stubs
// `useRouter` globally with a no-op object — every other export (
// `usePathname`, `useSearchParams`, ...) passes through untouched.
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: () => {},
    }),
  };
});
