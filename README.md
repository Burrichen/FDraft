# FDraft

A local-first Letterboxd watchlist companion and Monthly Watchlist Draft app. No account, no server-side database, no Docker required for normal use — your watchlist, drafts, and history live in this browser's own IndexedDB. See `docs/product-spec.md` for the full product specification and architecture.

For how to actually run and use FDraft, see **[local_setup.md](./local_setup.md)** — it covers installation, importing a Letterboxd export, starting a draft, and backing up your profile.

## Quick start

```bash
corepack enable   # one-time, if you haven't used pnpm before
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). That's it — no database to start, no account to create, no internet connection required beyond the very first load.

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

An optional `TMDB_API_KEY` (see `.env.example`) enables film metadata enrichment (posters, genres, runtime). Without it, imports work exactly the same, just without that extra metadata until a key is configured later.

## Architecture at a glance

- **Storage**: Dexie/IndexedDB, entirely client-side (`src/infrastructure/local-db/`). No server-side database.
- **Domain/application/repository layers**: `src/domain/`, `src/application/`, `src/repositories/` — pure, storage-agnostic business logic sitting behind a `Repositories` interface.
- **The one server-side route**: `src/app/api/metadata/route.ts`, a thin proxy to TMDB for optional metadata enrichment. Nothing else in the app talks to a server.
- **PWA**: `src/app/manifest.ts` and `src/app/sw.ts` (built via [Serwist](https://serwist.pages.dev)) make FDraft installable and give it a cached offline application shell — see `serwist.config.mjs`.
- **Backup/restore**: `src/domain/backup/`, `src/application/backup/` — a versioned, portable export/import format for moving a profile between devices.

`docs/product-spec.md` is the authoritative source of truth for product requirements and architecture decisions, including its "Implementation log" of what shipped in each phase.
# FDraft
