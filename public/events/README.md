# Event art packs

This folder holds each event's **artwork** — the images its pages,
easter eggs, and join modal actually render. It has nothing to do with
`src/domain/events/manifests/` (that folder holds curated FILM lists that
get fetched live from GitHub); the two are separate systems that happen
to both be called a "manifest" in this project. If you're looking for
where to add a film to Halloween's Horror/Kitsch pools, you want the
other folder.

## Folder layout

Every event gets its own subfolder, always shaped the same way:

```
public/events/<event-id>/
  manifest.json      <- the file you actually edit (see below)
  icons/              <- nav icons, if the event ships one as a file
  decorations/         <- small ambient pieces (fairy lights, scatter...)
  modal/               <- art shown in the event's join/intro dialog
  interactives/        <- easter eggs / stateful clickable art
  backgrounds/         <- full-page or full-card background art
```

Not every event uses every subfolder — an empty `{}` in `manifest.json`
for a category just means "nothing here yet," never an error.

## How to replace an image

**Just overwrite the file.** For example, to give the "lit" pumpkin a
real illustration instead of today's placeholder:

1. Open `public/events/halloween/manifest.json`.
2. Find `"pumpkin-lit": "interactives/pumpkin-lit.png"`.
3. Save your new artwork over `public/events/halloween/interactives/pumpkin-lit.png`
   (same filename, ideally a transparent-background PNG or WebP).

That's it — no code change, no rebuild step beyond the app's normal
build. The app always reads whatever file currently sits at that path.

## How to add a brand-new slot

1. Drop the new file into the right subfolder (e.g.
   `public/events/halloween/interactives/new-thing.png`).
2. Add a line to `manifest.json` under the matching category:
   ```json
   "interactives": {
     "new-thing": "interactives/new-thing.png"
   }
   ```
3. Only if a component needs to actually render it: reference the new
   slot name in that event's own small art lookup file (e.g.
   `src/components/events/halloween-art.ts`) — this is the one place
   per event that turns a slot name into something a component imports.

Editing `manifest.json` on its own (steps 1–2) is safe for a
non-engineer to do alone — it can only ever add or repoint a path.
Step 3 is a one-line code change, only needed when the new slot is
meant to appear somewhere it doesn't already.

## Format guidance

- **PNG or WebP** for anything that's a real illustration — gravestones,
  pumpkins, candy bowls, ghosts, modal artwork, background scenes.
  Transparent backgrounds are strongly preferred.
- **SVG** stays reserved for navigation icons, tiny UI icons, and small
  lightweight decorative accents (a star, a cobweb corner, a bat) — the
  kind of shape that's genuinely simpler as a few vector paths than as a
  raster file. Halloween's own small ambient decorations
  (`halloween-decorations.tsx`) are hand-authored inline SVG for exactly
  this reason and aren't part of this file-based system at all.
- If a file goes missing or fails to decode, the app hides that one
  image rather than showing a broken-image icon or crashing — see
  `EventArtImage` (`src/components/events/event-art-image.tsx`).

## Christmas

`public/events/christmas/` is a **scaffold only** — placeholder-quality
PNGs proving the same folder/manifest shape works for a second event,
with no Christmas event logic, page, or nav entry wired up anywhere yet.
Its nav icon will reuse `lucide-react`'s `Snowflake` when a real
Christmas Event is built (see the reservation note in
`src/components/events/event-visual-themes.ts`) — no icon file is
needed here until that happens.
