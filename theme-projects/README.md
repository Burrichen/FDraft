# theme-projects/

Readable, editable theme **project sources** — the human-editable form a
theme author works with in FDraft Studio (a separate application, in the
sibling `FDraft-Studio` repository), plus any copied source artwork a
project references.

This is NOT what FDraft loads at runtime. See `src/theme-packs/` for the
deterministic, compiled output FDraft actually reads. A project here is
compiled to a `.fdtheme` package (via `@fdraft/theme-sdk`'s `compileTheme`
and `packFdtheme`), and the compiled result is what's placed under
`src/theme-packs/<slug>/`.

No official themes exist here yet (see docs/updates, "FDRAFT THEME
RUNTIME — PROMPT 10") — `fdraft-integration-fixture/` is the one minimal,
real fixture proving the two-location boundary and the full compile →
pack → load → render pipeline end to end. It is not a real event theme.

See `docs/fdraft-theme-runtime/INTEGRATION.md` for the full pipeline.
