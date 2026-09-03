# src/theme-packs/

Deterministic, **compiled** runtime theme packages (`.fdtheme` archives) —
what FDraft actually loads and validates at runtime via
`src/infrastructure/theme-runtime/theme-loader.ts`. Never hand-edited:
each package here is produced by compiling a project under
`theme-projects/<slug>/` with `@fdraft/theme-sdk`'s `compileTheme` +
`packFdtheme`.

No official themes exist here yet (see docs/updates, "FDRAFT THEME
RUNTIME — PROMPT 10") — `fdraft-integration-fixture/theme.fdtheme` is the
one minimal, real fixture proving the two-location boundary and the full
compile → pack → load → render pipeline end to end (see
`src/infrastructure/theme-runtime/fdraft-integration-fixture.test.tsx`).
It is not a real event theme.

See `docs/fdraft-theme-runtime/INTEGRATION.md` for the full pipeline.
