import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadFdthemeArchive } from "./theme-loader";

/**
 * `__fixtures__/fdraft-studio-shared-fixture.fdtheme` is a byte-for-byte
 * copy of FDraft-Studio's own real
 * `fixtures/projects/sample-event.fdtheme` (copied here, not referenced
 * by an absolute sibling-repo path, so this test is portable to CI and
 * any other machine — see docs/fdraft-theme-runtime/INTEGRATION.md).
 *
 * This is a genuine parity check against the real cross-repo shared
 * fixture, not a hand-rolled one — and an honest one: as of this phase,
 * the shared fixture requires the `animations` capability (still
 * unsupported — not exercised by this phase, so not claimed) and an
 * `opt-in-button` component key (never part of Studio's official 14-key
 * default event template, so never implemented). `behaviour` is now
 * genuinely supported (see `compatibility.ts`'s
 * `FDRAFT_SUPPORTED_CAPABILITIES`/`FDRAFT_SUPPORTED_COMPONENT_KEYS` and
 * `default-template-support.test.tsx`'s real end-to-end proof) — this
 * fixture is still correctly rejected, but now for fewer, more precise
 * reasons than before, which is itself proof the compatibility check
 * tracks real support rather than a stale blanket rejection. The correct,
 * safe behaviour is for FDraft to recognise the remaining gaps and refuse
 * to render it — rather than either crashing or silently mis-rendering an
 * unsupported theme — which is exactly what this test proves. See
 * `fdraft-integration-fixture.test.tsx` for the complementary end-to-end
 * proof that a theme built entirely from capabilities/keys THIS phase
 * DOES support loads and renders correctly.
 */
describe("FDraft-Studio's real shared fixture", () => {
  it("is safely and clearly rejected as incompatible, never mis-rendered", async () => {
    const bytes = readFileSync(
      "src/infrastructure/theme-runtime/__fixtures__/fdraft-studio-shared-fixture.fdtheme",
    );
    const result = await loadFdthemeArchive(new Uint8Array(bytes));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INCOMPATIBLE_THEME");
    expect(result.error.devMessage).toMatch(/opt-in-button/);
    expect(result.error.devMessage).toMatch(/animations/);
    expect(result.error.devMessage).not.toMatch(/behaviour/);
    expect(result.error.userMessage).toBe(
      "This theme isn't compatible with this version of FDraft.",
    );
  });
});
