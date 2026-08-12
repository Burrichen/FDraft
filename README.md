# 🎬 FDraft

**A local-first Letterboxd companion that turns your watchlist into something you actually finish.**

No account. No server-side database. No Docker. Your watchlist, drafts, and history live entirely in _this browser_ — install it, use it offline, and it's still there tomorrow.

---

## What FDraft actually does

You've got a Letterboxd watchlist with 400 films on it and you're never going to pick one. FDraft fixes that:

|                                      |                                                                                                                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📥 **Import**                        | Bring in your Letterboxd export (`.zip` or `watchlist.csv`) in one click — parsed entirely on your device.                                                                                                                       |
| 🎲 **Random film**                   | Can't decide? One tap picks something for you, weighted toward films that have been waiting the longest.                                                                                                                         |
| 🗂️ **Drafts**                        | A themed set of films with a deadline — Baby (5 films) up to Hardcore (20), or Freeform if you don't want a limit. Some films are random, some satisfy a themed challenge ("something you added years ago," "under 90 minutes"). |
| ⏳ **Deadlines that mean something** | Miss one and FDraft asks _why_, film by film — genuinely didn't get to it, changed your mind, or just didn't — and adjusts your watchlist accordingly.                                                                           |
| 📊 **Stats**                         | Genre and decade breakdowns, average watchlist age, and more — built from whatever data it actually has.                                                                                                                         |
| 🖼️ **Optional metadata**             | Posters, genres, runtime, ratings — fetched from [TMDB](https://www.themoviedb.org/) only when you ask, cached forever after. Everything else works with zero internet.                                                          |
| 💾 **Real backups**                  | Export your whole profile to a single file, move it to a new device, or keep it as a safety copy. Nothing lives on a server to lose.                                                                                             |

---

## Getting started

You'll need [Node.js](https://nodejs.org) v20+.

```bash
corepack enable   # one-time, if you've never used pnpm before
pnpm install
pnpm dev
```

Open **[http://localhost:3000](http://localhost:3000)**. That's it — no database to start, no account to create, no internet connection required beyond the very first load.

---

## Using it

### The first time you open it

You'll see a **Welcome to FDraft** screen asking for a profile name — just a name, nothing else. No email, no password. Type something like "Alex," press **Create Profile**, and that's your own private watchlist, drafts, and history — separate from anyone else's profile on this device.

### Bring in your watchlist

From the **Watchlist** tab, click **Import**:

1. On [letterboxd.com](https://letterboxd.com), go to **Settings → Import & Export → Export your data**.
2. Drag the resulting `.zip` onto the import screen — or use a plain `watchlist.csv` if that's all you have.
3. Click **Import**.

The file is parsed entirely on your device and never uploaded anywhere — this works with no internet connection at all.

### Watch something

The **Watchlist** tab is a poster grid of everything you haven't seen yet. Click a poster to open it on Letterboxd, click the eye icon to mark it watched, or hit **Random film** and let FDraft decide for you.

### Start a Draft

This is the main event. From **Drafts**, click **Start a draft**:

- Pick a **difficulty** — Baby (5) → Hardcore (20), or Freeform for an open-ended list you top up whenever.
- Pick a **deadline** — end of this month, or a straight 30-day timer.
- FDraft builds the list for you: some films at random, some to satisfy a themed challenge. Let it choose challenges automatically, or pick your own.

The Drafts tab then becomes your dashboard: a countdown, a progress bar, and the films themselves. Mark them watched as you go.

**If you miss the deadline**, FDraft asks about every unfinished film — _"I didn't get time, but I wanted to!"_ (stays on your watchlist, gets prioritized), _"Actually, I don't want to watch this"_ (comes off for good), or _"I just didn't"_ (no change). Once you've answered everything, the draft moves to **History** forever.

### Everything else

- **Stats** — the bigger picture, whenever you want it.
- **Settings → Metadata** — fetch posters/genres/runtime for films that don't have them yet, or refresh old ones. Nothing reaches the internet unless you click one of these buttons.
- **Settings → Data & Backups** — export your whole profile to a file, or bring one back in on a new device. Replacing an existing profile always downloads a safety copy first and asks you to confirm.

For the full walkthrough — profiles, backup/restore details, offline behavior — see **[local_setup.md](./local_setup.md)**.

---

## Development

```bash
pnpm dev          # start the dev server
pnpm build        # production build (also generates the PWA service worker — see serwist.config.mjs)
pnpm start        # run the production build
pnpm test         # unit/integration tests (Vitest)
pnpm test:e2e     # end-to-end tests (Playwright), including offline scenarios
pnpm lint         # ESLint
pnpm typecheck    # strict TypeScript, no emit
pnpm format       # Prettier, writes changes
```

An optional `TMDB_API_KEY` (see `.env.example`) enables film metadata enrichment. Without it, imports work exactly the same, just without posters/genres/runtime until a key is configured later.

### Desktop (Tauri)

FDraft also ships as a Windows desktop app via [Tauri 2](https://v2.tauri.app) — same codebase, same local-first behavior, no bundled server.

Prerequisite beyond Node.js: [Rust](https://www.rust-lang.org/tools/install) (via `rustup`). On Windows you'll also need the WebView2 runtime (preinstalled on modern Windows) and the Visual Studio Build Tools' "Desktop development with C++" workload.

```bash
pnpm run desktop:dev   # same `pnpm dev` server, opened in a native window — hot reload works as usual
```

`src-tauri/` holds the Rust shell. The desktop build's only real difference from the browser is metadata fetching — see `src/application/metadata/tauri-metadata-transport.ts` — since a packaged desktop app has no server to hide `TMDB_API_KEY` behind; everything else (IndexedDB, imports, drafts, offline behavior) is unchanged.

### Build

```bash
pnpm run desktop:build   # production Windows installer (FDraft_<version>_Setup.exe) — Windows only; see "Release" below
```

Real, distributable Windows installers are only ever produced by the [GitHub Actions release workflow](.github/workflows/release.yml) (a genuine Windows build environment). Running `desktop:build` yourself works for a local sanity check, but producing a _signed updater artifact_ requires `TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to also be set in your own shell — see "Updater secrets" below.

### Release

FDraft checks for updates on launch and offers them in-app (Settings → Updates); see `src/components/updates/`. To ship a new version:

1. Make your changes and merge them.
2. Run the full check locally: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`.
3. Bump `version` in `package.json` (the one source of truth — `pnpm run sync-desktop-version` copies it into `src-tauri/tauri.conf.json`/`Cargo.toml`; the release workflow also runs this automatically).
4. Commit, then tag: `git tag v1.1.0` (must match `package.json`'s version exactly).
5. `git push --tags`.
6. GitHub Actions builds the Windows installer + signed updater artifacts and opens a **draft** GitHub Release.
7. Edit the draft's release notes (short and user-friendly — this text is what FDraft's update dialog shows) and publish it.
8. Existing installs on "Automatically check for updates" pick it up on their next launch.

#### Updater secrets

The release workflow needs these repository secrets (**Settings → Secrets and variables → Actions**) — never commit their values:

| Secret                               | Purpose                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | The updater's private signing key (generated once via `tauri signer generate`). Proves a downloaded update genuinely came from this project — installs refuse anything signed with a different key.                                 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password protecting the private key above.                                                                                                                                                                                          |
| `TMDB_API_KEY`                       | Baked into the release binary at compile time (see `src-tauri/src/lib.rs`'s `get_tmdb_api_key`) so a packaged install can fetch metadata without shipping a `.env` file. The same key already in your `.env.local` works fine here. |

`GITHUB_TOKEN` is provided automatically by GitHub Actions — nothing to configure. Windows Authenticode/publisher code signing is explicitly out of scope for Version 1 (see `docs/product-spec.md`); an unsigned installer will trigger a Windows SmartScreen "unrecognized app" warning, which is expected and not a broken build — see "Distribution" below.

### Distribution

For friends: **GitHub Releases → download the `FDraft_<version>_Setup.exe` asset → run it → install.** No Node, no Docker, no backend — it's a normal Windows installer. Future updates are offered inside FDraft itself once installed.

Because the installer isn't Authenticode-signed (out of scope for Version 1), Windows SmartScreen may show an "unrecognized app" warning on first run — this is expected for a small, privately-distributed installer, not a sign of a broken or malicious build. There's no way to remove this warning without paid code signing, and this README won't walk through disabling Windows security to bypass it.

## Architecture at a glance

- **Storage**: Dexie/IndexedDB, entirely client-side (`src/infrastructure/local-db/`). No server-side database.
- **Domain/application/repository layers**: `src/domain/`, `src/application/`, `src/repositories/` — pure, storage-agnostic business logic sitting behind a `Repositories` interface.
- **Metadata transport**: `src/application/metadata/remote-metadata-client.ts` picks the transport at runtime — `src/app/api/metadata/route.ts` (a thin TMDB proxy) in the browser, `tauri-metadata-transport.ts` (Tauri's HTTP plugin, run from Rust) on desktop. Nothing else in the app talks to a server or knows which runtime it's in.
- **PWA**: `src/app/manifest.ts` and `src/app/sw.ts` (built via [Serwist](https://serwist.pages.dev)) make the browser build installable and give it a cached offline application shell — see `serwist.config.mjs`. Disabled in the desktop build, which doesn't need it (see `src/app/layout.tsx`).
- **Desktop shell**: `src-tauri/` (Tauri 2) — see "Desktop (Tauri)" above.
- **Updates**: `src/components/updates/` (state machine + UI), `src/application/updates/tauri-updater.ts` (the only module touching `@tauri-apps/plugin-updater`), `src/domain/updates/update-check-policy.ts` (pure check-frequency rule). Desktop-only, checks GitHub Releases, always asks before installing — see "Release" above.
- **Backup/restore**: `src/domain/backup/`, `src/application/backup/` — a versioned, portable export/import format for moving a profile between devices (including between the browser and desktop builds).

`docs/product-spec.md` is the authoritative source of truth for product requirements and architecture decisions, including its implementation log of what shipped in each phase.
