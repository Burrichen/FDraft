# Using FDraft

FDraft is a personal Letterboxd watchlist companion. Everything you add —
your watchlist, your drafts, your history — stays on this device. There's
no account, no sign-up, and (aside from optionally fetching poster/genre
info) it works completely offline.

---

## Getting it open

You'll need [Node.js](https://nodejs.org) (v20 or newer) installed. Then, from this folder:

```
corepack enable      # one-time, if you've never used pnpm before
pnpm install          # one-time
pnpm dev
```

Open **http://localhost:3000** in your browser. That's it — no database to
start, no account to create, no internet connection required.

---

## The first time you open it

You'll see a **Welcome to FDraft** screen asking for a profile name —
just a name, nothing else (no email, no password). Type something like
"Alex" and press **Create Profile**. That's your profile: your own
private watchlist, drafts, and history, separate from anyone else's
profile on this device.

## Bringing in your watchlist

From the **Watchlist** tab, click **Import**.

1. On [letterboxd.com](https://letterboxd.com), go to **Settings → Import & Export → Export your data**.
2. You'll get a `.zip` file. You can upload that directly — it brings in your watchlist, ratings, watched
   history, and diary all at once. If you only have a plain `watchlist.csv`, that works too, just with less
   history alongside it.
3. Choose the file and click **Import**.

This happens entirely on your device — the file is never sent anywhere. You can do this with no internet
connection at all.

If some films need extra details (posters, genres, runtime) fetched from the internet, you'll see a note
like "154 films need metadata" — that's fine, and covered below.

## Your watchlist

The **Watchlist** tab shows every film you haven't watched yet as a poster grid:

- Click a poster to open that film on Letterboxd.
- Click the eye icon on a poster any time to mark it watched.
- **Random film** picks one for you on the spot, weighted toward films that have been sitting there longest.

## Starting a Draft

A **Draft** is a themed set of films from your watchlist with a deadline — the main way to actually chip away
at your list. From the **Drafts** tab, click **Start a draft**:

- **Difficulty** decides how many films: Baby (5), Easy (8), Medium (10), Hard (12), Hardcore (20), or
  Freeform (open-ended — generate 5 more whenever you like).
- Some of the films are picked completely at random; the rest are picked to satisfy a themed **challenge**
  (e.g. "something you added years ago," "a film under 90 minutes"). You can let FDraft pick challenges for
  you, or browse and choose your own.
- **Deadline**: Calendar ends at the end of this month; Timer gives you exactly 30 days.

Once created, the **Drafts** tab becomes your dashboard — a countdown, a watched/total progress bar, and the
films themselves. Click the eye icon on any film to mark it watched, same as on your main watchlist.

### If you miss the deadline

You'll be asked, film by film, **"Why didn't you watch these?"** — pick whichever's true:

- **"I didn't get time, but I wanted to!"** — it stays on your watchlist and gets picked more easily next time.
- **"Actually, I don't think I want to watch this at all"** — it comes off your watchlist for good.
- **"I just didn't"** — no change either way.

Once every leftover film is answered, the draft moves to **History**, where it stays forever — difficulty,
dates, which films you finished, and what happened to the rest.

## Stats

The **Stats** tab shows the bigger picture any time — how many films you have left, how old your watchlist
is on average, genre/decade/rating breakdowns, and more. It only shows cards for things it actually has data
for.

## Settings — profiles and metadata

Open **Settings** from the profile icon in the top right.

**Profiles.** Share this device with someone else, or just want a separate list for a different mood? Click
**+ Create Profile**. With more than one profile, each row lets you switch, rename, or delete. Deleting a
profile is permanent — it asks you to confirm in a dialog first, since it erases that profile's entire
watchlist, drafts, and history.

**Metadata.** This is where poster/genre/runtime/rating info gets filled in for your films — the one part of
FDraft that needs the internet. You'll see how many films are cached, missing, or old:

- **Download Missing Metadata** fetches details for films that don't have any yet.
- **Refresh Old Metadata** re-fetches films whose details haven't been updated in a while.

Neither of these runs automatically — nothing reaches out to the internet unless you click one of these
buttons. If you're offline when you try, you'll get a clear message instead of anything breaking, and you can
just try again later. Everything else in FDraft — drafts, challenges, stats — works entirely from whatever's
already been downloaded.

## Backing up and moving to a new device

Because everything lives only on this device, there's no account to sign into elsewhere — moving to a new
computer, or just keeping a safety copy, means exporting a backup file yourself. Find this under
**Settings → Data & Backups**.

- **Export FDraft Backup** downloads a single file — something like `My-FDraft-Alex-2026-08-11.fdraft` —
  containing your whole profile: watchlist, drafts, draft history, watched films, ratings, and settings.
  Works completely offline, and the file never goes anywhere except your own Downloads folder.
- **Export Readable JSON** is the same data in a plain-text format you can open and read yourself — mainly
  useful for troubleshooting, not something you need day to day.
- **Last backup** shows how long it's been since you last exported one. If it's been a while, you'll see a
  gentle reminder — FDraft never nags about this repeatedly or forces you to back up.

To bring a backup back in, click **Import FDraft Backup** and choose the file. FDraft reads it, checks it's a
real FDraft backup, and shows you a summary — profile name, when it was exported, and how much it contains —
before touching anything. You then choose how to bring it in:

- **Import as New Profile** (recommended) adds it as a separate profile alongside whatever's already on this
  device. Nothing existing is touched — this is the safe default, and what you want when setting up a new
  device.
- **Replace Existing Profile** overwrites your _currently active_ profile with the backup's contents. This
  asks you to confirm first, since it can't be undone, and automatically downloads a safety copy of what
  you're about to overwrite before making the change.

Importing also happens entirely on your device — the file is only ever read locally, never uploaded anywhere.
If the file is corrupted, from a much newer version of FDraft, or otherwise not a valid backup, you'll get a
clear explanation instead of anything breaking.

## Using it offline

Once FDraft is open, everything works with no internet connection: importing your watchlist, browsing it,
creating and working through drafts, marking films watched, checking stats, switching profiles, and changing
settings. The only exception is fetching new poster/genre/rating info, which needs the internet — and even
that never blocks anything else while it's unavailable.

## Moving data from an old account-based version

If you used an earlier version of FDraft that required signing in, see `docs/local-first-migration.md` for
how to bring that data into a local profile.
