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

## Architecture at a glance

- **Storage**: Dexie/IndexedDB, entirely client-side (`src/infrastructure/local-db/`). No server-side database.
- **Domain/application/repository layers**: `src/domain/`, `src/application/`, `src/repositories/` — pure, storage-agnostic business logic sitting behind a `Repositories` interface.
- **The one server-side route**: `src/app/api/metadata/route.ts`, a thin proxy to TMDB for optional metadata enrichment. Nothing else in the app talks to a server.
- **PWA**: `src/app/manifest.ts` and `src/app/sw.ts` (built via [Serwist](https://serwist.pages.dev)) make FDraft installable and give it a cached offline application shell — see `serwist.config.mjs`.
- **Backup/restore**: `src/domain/backup/`, `src/application/backup/` — a versioned, portable export/import format for moving a profile between devices.

`docs/product-spec.md` is the authoritative source of truth for product requirements and architecture decisions, including its implementation log of what shipped in each phase.
