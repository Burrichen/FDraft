# FDraft theme runtime integration (Prompt 10)

Integrates the released `@fdraft/theme-sdk` / `@fdraft/theme-renderer`
packages (built in the sibling `FDraft-Studio` repository) into FDraft as
real, exact-pinned dependencies, with FDraft's own host adapters, runtime
theme loading, safe fallback, and a development-only preview surface.
This is the first phase authorised to modify FDraft for this initiative.

## Confirmed base

- **Base ref**: `main` @ `8bc5af7e6f765cd58b3d979cf8de3bc6a51ccf2a`
  (`fix: Windows CI failure in theme-apply subprocess test + v1.2.0-beta.9`).
  `feat/update1` (Beta) was byte-identical (`git diff main feat/update1`
  empty) at the same commit — no ambiguity between candidate bases.
- **Integration branch**: `feature/fdraft-theme-runtime`, created from
  that commit.
- **Explicitly excluded**: `feat/dev-build1-event-studio` (the prior,
  now-closed in-app Event Studio editor branch) — no code, branch, or
  history from it was merged, cherry-picked, or copied into this branch.
  FDraft's own pre-existing `.fdraft-theme` format
  (`src/domain/event-themes/`) and its read-only renderer
  (`src/components/events/event-theme-layout-renderer.tsx`) are a
  **separate, older system** that shipped in Beta (`v1.2.0-beta.7`) —
  unrelated to and untouched by this integration.

## Exact package versions and how they were verified

- `@fdraft/theme-sdk@0.1.0`
- `@fdraft/theme-renderer@0.1.0`

Pinned in `package.json` as exact GitHub Release tarball URLs (immutable
release `theme-runtime-v0.1.0`, cut by explicit repository-owner
authorization — see `FDraft-Studio`'s
`docs/architecture/COMPATIBILITY_AND_RELEASES.md`):

```json
"@fdraft/theme-renderer": "https://github.com/Burrichen/FDraft-Studio/releases/download/theme-runtime-v0.1.0/fdraft-theme-renderer-0.1.0.tgz",
"@fdraft/theme-sdk": "https://github.com/Burrichen/FDraft-Studio/releases/download/theme-runtime-v0.1.0/fdraft-theme-sdk-0.1.0.tgz"
```

**Verified, not assumed**, before pinning:

1. Downloaded both tarballs and `SHA256SUMS.txt` directly from the
   GitHub Release and independently re-computed their SHA-256 checksums
   with `shasum -a 256 -c` — both matched (`OK`).
2. Extracted both tarballs and confirmed real, non-empty `dist/` output
   and correct metadata — notably `@fdraft/theme-renderer`'s own packed
   `package.json` pins `"@fdraft/theme-sdk": "0.1.0"` (a resolved exact
   version, never `workspace:*`).
3. Ran `pnpm install` and a real Node smoke script importing both
   packages from FDraft's own `node_modules` and calling real exports
   (`isRendererCompatible`, `SAMPLE_COMPONENT_KEYS`, etc.) — confirmed
   working end to end.
4. `pnpm-lock.yaml` records each package's own `sha512` integrity hash
   from the actual download, independent of the manual sha256 check
   above — any later tampering with the release asset would be caught
   on the next install.

**A real, un-tagged, un-released state was rejected first.** Before this
release existed, `FDraft-Studio`'s `main` had the SDK/renderer source
present but almost entirely uncommitted, no tag, and no GitHub Release —
its own `docs/IMPLEMENTATION_STATUS.md` explicitly flagged this as
"action needed from the repository owner" before Prompt 10 could
proceed. That state was surfaced and the integration was stopped rather
than substituting a workspace link, a floating version, or copied
source — see the pending-decision message in this session's own history.
Only after the repository owner cut the real `theme-runtime-v0.1.0`
release (verified above) did this phase proceed.

**pnpm-specific note (documented, deliberate security tradeoff):**
`@fdraft/theme-renderer`'s packed `package.json` resolves its own
`@fdraft/theme-sdk` dependency as a bare semver, which pnpm would
otherwise fetch from the public npm registry even though FDraft's
top-level `package.json` already pins the exact tarball URL. `pnpm-workspace.yaml`
adds an `overrides` entry redirecting it to the same tarball URL — but
pnpm's `blockExoticSubdeps` (default `true`) then refuses to resolve
that override at all, since it doesn't recognise the override as
resolving to the SAME URL a real top-level dependency also uses. There
is no per-package allowlist for this pnpm setting (checked pnpm's own
settings docs) — only the global toggle, so `pnpm-workspace.yaml` sets
`blockExoticSubdeps: false`. This is a real, flagged reduction in a
generic pnpm supply-chain protection, not a silent one — both tarball
URLs remain checksum-verified against the immutable GitHub Release as
described above, so this does not remove that verification, only pnpm's
own separate transitive-exotic-source refusal.

## Compatibility handshake

`src/infrastructure/theme-runtime/compatibility.ts`:

- `getThemeRuntimeCompatibility()` — installed SDK/renderer versions
  (read from a generated constants file, see below — neither package
  exports its own `package.json` as an importable subpath), supported
  project/theme format range (`0.9.0`–`1.0.0` project,
  `1.0.0`–`1.0.0` theme, from the SDK's own `MIN_SUPPORTED_*`/`CURRENT_*`
  constants), FDraft's own supported component keys, and FDraft's own
  supported theme capabilities.
- `checkThemeCompatibility(manifest)` — checks one loaded theme's
  `minRendererVersion`/`requiredComponentKeys`/`capabilities` against
  the above; used by `theme-loader.ts` before ever rendering anything.

Neither package exports its own installed version as an importable
value (their `exports` maps correctly don't expose `package.json` as a
subpath). `scripts/sync-theme-runtime-versions.ts` reads the real
installed versions from `node_modules` and writes
`src/infrastructure/theme-runtime/installed-versions.generated.ts` —
run manually (`pnpm run sync-theme-runtime-versions`) whenever the
pinned version changes, verified for drift via
`pnpm run check-theme-runtime-versions` (same generate-then-check
convention as the pre-existing `scripts/sync-desktop-version.ts`).

## FDraft host adapters

`src/components/events/theme-runtime/component-adapters.tsx` implements
exactly 7 keys — the ones Prompt 10 names explicitly as the required
starting set, matching `@fdraft/theme-renderer`'s own
`SAMPLE_COMPONENT_KEYS`/`SAMPLE_COPY_CONTRACTS` shape so a theme authored
against the shared fixture needs no changes to render against FDraft's
real adapters:

| Key                 | Real FDraft component/logic reused                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page-title`        | `CardTitle` (shadcn) — pure copy, no dynamic data                                                                                                                                                               |
| `event-information` | `Card`/`CardTitle` — pure copy (`eventName`, `dateRange`)                                                                                                                                                       |
| `event-countdown`   | Typed `countdownTargetAtMs` from `FDraftThemeRenderContext`, resolved via the real `getEffectiveEventDate` (respects the Admin Mode test-date override) + `getNextOccurrenceStart` in `build-render-context.ts` |
| `draft-controls`    | The real `DraftLifecycleView` component, reused wholesale (not reimplemented)                                                                                                                                   |
| `film-grid`         | The real `ActiveDraftFilms`/`DraftFilmCard` components, given host-supplied `films`                                                                                                                             |
| `event-progress`    | The real `Progress` UI primitive + typed progress values, reusing `calculateDraftFilmProgress`                                                                                                                  |
| `points-counter`    | The real `PointsCard` component + the real `PointsRepository.getBalance`                                                                                                                                        |

**FDraft's own supported set is a deliberate subset**, not the full
16-key sample registry — `FDRAFT_SUPPORTED_COMPONENT_KEYS`/
`FDRAFT_SUPPORTED_CAPABILITIES` in `compatibility.ts` are the single
source of truth `checkThemeCompatibility` enforces. Capabilities
declared supported: `responsive`, `masters`, `popups`. **Not** yet
supported: `animations`, `behaviour`, `effects` — a theme requiring
these is correctly and safely rejected (see Verification below), never
mis-rendered.

**Dynamic values stay host-owned**, per Prompt 10's explicit rule: every
adapter reads numeric/list values (points balance, progress counts, the
film list, the countdown target) only from
`src/infrastructure/theme-runtime/render-context.tsx`'s
`FDraftThemeRenderContextProvider` (a value built exclusively by
`src/application/theme-runtime/build-render-context.ts` from real
repository/domain calls) or an existing real app context
(`ProfileProvider`/`EventDiscoveryProvider`/`WatchUndoProvider`) — never
fetched by an adapter itself, and never theme-authored. Copy text is
rendered exactly as `@fdraft/theme-renderer`'s own
`resolveComponentCopy` resolves it (default/override + placeholder
substitution) — no adapter re-derives display text.

**Known, documented gap**: `draft-controls`' copy contract declares
`skipLabel`/`confirmLabel` (matching the shared fixture), but the real
`DraftLifecycleView` this adapter reuses renders its own Skip/Confirm
button text internally with no prop to override it — those two copy
slots are not yet wired to anything. Action/route/disabled-logic/
accessible-fallback all remain fully FDraft-owned regardless, per the
same "button wording may be overridden, action stays host-owned" rule.

## Runtime theme loading and fallback

`src/infrastructure/theme-runtime/theme-loader.ts`:

- `loadFdthemeArchive(bytes)` — calls the SDK's own `unpackFdtheme`
  (which already does manifest-hash verification, archive-security
  checks — path traversal, dangerous extensions, zip-bomb ratios — and
  semantic validation internally, see `@fdraft/theme-sdk/packaging`),
  then `checkThemeCompatibility` against FDraft's own installed
  renderer/adapters. Never throws — every failure becomes
  `{ ok: false, error: { code, userMessage, devMessage } }`, with
  `userMessage` safe to show in production (never a path) and
  `devMessage` detailed but only ever surfaced outside production.
- `createValidatedPackageAssetResolver(document, assets)` — resolves
  each asset id to a `blob:` URL built ONLY from the bytes
  `unpackFdtheme` already verified came from inside the validated
  archive. An asset id absent from the document resolves to `undefined`
  (the renderer's own "missing asset" fallback), never an error, and
  nothing here ever fetches an external URL.

`src/components/events/theme-runtime/theme-boundary.tsx`'s
`ThemeBoundary` is the outer React error boundary around any mounted
`<ThemeRenderer>` — `@fdraft/theme-renderer` already isolates failures
per-layer/per-page internally; this catches anything that gets past
that (a malformed document, an adapter itself throwing) and renders a
host-supplied `fallback` (normal FDraft's own existing interface)
instead, logging the real error only outside production.

## Development-only preview

No CLI-arg-to-page channel exists in a Next.js dev server, so the
closest faithful equivalent to `--theme-preview <local-path>` is a
dev-only route:

```
pnpm run dev
# then visit http://localhost:3000/theme-preview
# enter an ABSOLUTE path to a .fdtheme file, e.g.:
#   /Users/you/FDraft/src/theme-packs/fdraft-integration-fixture/theme.fdtheme
```

- `src/app/(dev)/theme-preview/page.tsx` calls `notFound()` server-side
  the moment `NODE_ENV === "production"` — **verified empirically**: a
  real `next build && next start` returns HTTP 404 for both
  `/theme-preview` and `/api/theme-preview`, while `/watchlist` (normal
  FDraft) returns 200 unaffected.
- `src/application/theme-runtime/theme-preview-server.ts` (the real
  file-reading logic behind `/api/theme-preview`) independently refuses
  to run at all once `isThemePreviewEnabled()` is false — belt-and-braces
  alongside the page-level `notFound()`.
- Uses a **fresh, throwaway, per-page-load profile database**
  (`theme-preview-<uuid>`) seeded with one mock profile — never the
  user's real profile — and a static mock render context
  (`pointsBalance: 123`, etc.) — never a real repository read for
  dynamic values, and never a real-clock/Admin-Mode date. Nothing here
  can alter a real profile or date.
- **Local-only reload protocol** (for Prompt 11): `GET
/api/theme-preview/watch?path=...` returns the file's current mtime;
  the preview page polls it every second and reloads on change. Plain
  polling over the same dev-server route (bound to localhost by Next.js
  itself) — no new network listener, no websocket/SSE push.

## Repository content boundaries

- `theme-projects/<slug>/` — readable, editable `StudioProjectDocument`
  JSON (the human-editable source a theme author works with in FDraft
  Studio). Not loaded by FDraft at runtime.
- `src/theme-packs/<slug>/` — deterministic compiled `.fdtheme` output
  (via `@fdraft/theme-sdk`'s `compileTheme` + `packFdtheme`). This is
  what `theme-loader.ts` actually reads.

No official themes exist yet. `fdraft-integration-fixture` is the one
minimal, real fixture (built through the actual released compile/pack
pipeline, not hand-authored JSON) proving both locations and the full
pipeline end to end. No Studio application code was added to FDraft.

## Verification evidence

- **Full suite**: `pnpm run format:check`, `pnpm run lint`,
  `pnpm run typecheck`, `pnpm run test` (190 files / 2036 tests, all
  passing), `pnpm run build` (web), `pnpm run build:desktop-frontend`
  (Tauri static export) — all clean. `cargo check` in `src-tauri`
  unaffected (no Rust touched).
- **Real cross-repo parity, both directions**:
  - `shared-fixture-compatibility.test.ts` loads a byte-for-byte copy of
    `FDraft-Studio`'s own real
    `fixtures/projects/sample-event.fdtheme` and asserts it is
    **correctly and safely rejected** (`INCOMPATIBLE_THEME`, naming
    `opt-in-button`/`animations`/`behaviour`) — an honest result: that
    fixture exercises capabilities this phase doesn't implement yet,
    and FDraft correctly refuses it rather than mis-rendering.
  - `fdraft-integration-fixture.test.tsx` loads the real, compiled
    `src/theme-packs/fdraft-integration-fixture/theme.fdtheme` (built
    entirely from capabilities/keys this phase DOES support) and
    renders it through FDraft's real adapters end to end, asserting the
    real placed copy and typed values appear.
- **Actually launched and visually inspected** (headless Chromium,
  multiple fresh browser contexts, screenshots taken and read) — not
  claimed without checking:
  - Normal FDraft (`/watchlist`) — loads cleanly, zero console/page
    errors, both before and after every change in this phase.
  - The theme preview, loading `fdraft-integration-fixture` — this
    caught and led to fixing **three real bugs** before being accepted:
    1. `EventArtImage`-unrelated: a Tailwind `truncate` class on the
       `page-title` adapter silently clipped visible text with an
       ellipsis while the full string stayed in the DOM (a test
       asserting `textContent` would have passed while a real user saw
       a truncated title) — replaced with wrapping (`break-words`),
       which can never clip.
    2. React Strict Mode's dev-only mount → cleanup → remount cycle
       raced the preview's own profile-seeding effect against its
       database close, producing a genuine `DatabaseClosedError` —
       fixed by deferring the close until the write has actually
       settled, not closing synchronously in the cleanup.
    3. The same double-invoke then caused a duplicate `create()` call
       with the same fixed id, throwing `ConstraintError` — recognised
       and silently treated as the expected benign duplicate it is,
       rather than logged as a failure.
  - Final state, confirmed across multiple fresh runs: full title text
    visible with no overlap, points counter correct, zero console/page
    errors, on both the preview and normal FDraft.
  - Production build: real `next start` under `NODE_ENV=production`
    confirms `/theme-preview` and `/api/theme-preview` both 404 while
    `/watchlist` returns 200.

## Rollback

- Revert to `main` @ `8bc5af7e6f765cd58b3d979cf8de3bc6a51ccf2a` (this
  phase's confirmed base) — nothing on `main`/`feat/update1` was
  touched by this branch.
- If only the package pin needs reverting: remove the two
  `@fdraft/*` entries from `package.json`, remove the `overrides`/
  `blockExoticSubdeps` lines from `pnpm-workspace.yaml`, delete
  `src/infrastructure/theme-runtime/`,
  `src/application/theme-runtime/`,
  `src/components/events/theme-runtime/`,
  `src/app/(dev)/theme-preview/`, `src/app/api/theme-preview/`,
  `theme-projects/`, `src/theme-packs/`, and
  `scripts/sync-theme-runtime-versions.ts`, then `pnpm install`.
- The release itself (`theme-runtime-v0.1.0`) is immutable per
  `FDraft-Studio`'s own documented policy — rolling back a bad release
  means cutting a new tag/version there and repointing this pin, never
  editing the existing tag.

## Remaining blockers before Prompt 11

- `draft-controls`' `skipLabel`/`confirmLabel` copy overrides are
  declared but not wired to real button text (see "Known, documented
  gap" above).
- `film-grid` takes host-supplied `films` rather than self-fetching a
  real draft record — `DraftLifecycleView`'s own draft-record-to-
  `DraftFilmCardView[]` mapping is private/inline, not yet extracted
  into an independently reusable function; doing so safely (without
  regressing the already-tested `DraftLifecycleView`) is real follow-up
  work, not attempted here to avoid duplicating/risking that logic.
- Only 7 of `@fdraft/theme-renderer`'s 16 sample component keys have a
  real FDraft adapter; only 3 of 6 theme capabilities
  (`responsive`/`masters`/`popups`) are declared supported. Extending
  either requires the same real-component-mapping care as this phase's
  7 keys, not a mechanical registry addition.
- `event-countdown`'s live tick uses wall-clock `Date.now()` for its
  once-a-second display animation (the target timestamp itself is
  correctly resolved through the Admin-Mode-aware
  `getEffectiveEventDate`) — a deliberate, documented scope choice, not
  an oversight.
