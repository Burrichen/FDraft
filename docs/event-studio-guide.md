# Event Studio Guide

A quick reference for using Event Studio to design Event artwork visually.
Written for using the tool, not for framework engineers — see
`docs/event-art-guide.md` if you just want to hand-edit files without
opening the app at all.

## Opening Event Studio

Event Studio only exists in **FDraft (Dev)** — the separate desktop build
with the red icon, kept in its own data directory so it never touches your
real profile. Launch FDraft (Dev) like the normal app; a "Studio" nav
entry appears that isn't there in normal FDraft.

## Connect the FDraft Project

In Studio, use **Connect Project** (bottom of the left panel) to pick your
local clone of this repository — this is the real FDraft Git project, not
a separate art library. Studio reads artwork live from `public/events/` in
that folder and writes exported themes into `public/event-themes/` when
you ask it to — it never touches anything outside the folder you pick.
Launched from a source checkout in dev mode, Studio detects and connects
this automatically; a packaged FDraft (Dev) remembers your last choice.

**Images used in production live INSIDE the FDraft project and are
shipped with FDraft** — there is no separate art store anywhere else.

## Adding an Image

1. In the Asset Browser, press **Import Image**.
2. Choose the source file (PNG/WebP/SVG) from anywhere on your computer.
3. Pick the **Event** and **Folder** — Studio shows you the exact
   destination path before you confirm.
4. Press **Import** — Studio copies it into `public/events/<event>/...`.
   The original file is never referenced again; only the copy is.
5. Use it in the layout like any other asset.
6. Commit the new image (and theme) through Git normally — Studio never
   commits or pushes for you.

## Replacing an Image

1. Find it in the Asset Browser and press its small **Replace** icon.
2. Select the replacement file and confirm.
3. The same filename/path is retained — every layout already using it
   shows the replacement immediately, with nothing else to update.

## Deleting an Image

Press an asset's **Delete** icon. If it's used anywhere in the current
theme, Studio lists exactly where and asks you to confirm before removing
the file.

## Designing a Page

Pick, in order: **Preset** → **Page** → **State** → **Desktop / Tablet /
Mobile**. Then drag images from the Asset Browser onto the canvas, and
use the selection handles to move, resize, and rotate. Use the Inspector's
**Crop** button to crop non-destructively (the source file is never
touched). Check all three breakpoints separately — a layout that looks
right on Desktop can still need adjusting on Mobile.

## Layers

The Layers list (right panel) shows every placement on the current page/
state/breakpoint, top to bottom in stacking order. Rename, hide, lock, or
reorder a layer there — locking just protects it from accidental edits in
Studio, it has no effect on the exported theme.

## Variants

A **Variant Group** shows one of several images at random, by weight,
instead of always the same one. Example — "Mid Right":

| Option  | Weight |
| ------- | ------ |
| Ghost 1 | 35%    |
| Ghost 2 | 25%    |
| Cat 2   | 20%    |
| Nothing | 20%    |

Select a fixed placement and click **Convert to Variant Group**, then add
options and set each one's weight — Studio shows the resulting percentages
live. "Nothing" is a real, valid option (nothing renders that draw), not
an error state. Use **Reroll Preview** to see a different random pick
without changing anything real.

## Saving

Three different things, easy to mix up:

- **Autosave** — happens automatically in the background while you edit.
  A safety net only, for crash/restart recovery — never what Load
  restores, and not the same as a real Save.
- **Save** — the toolbar's **Save** button. Your deliberate checkpoint for
  this preset. **Load** always restores the last one of these.
- **Export** — turns your saved work into an actual `.fdraft-theme` file,
  ready to hand to Beta (see below). Saving does not export, and
  exporting does not save.

## Sending to Beta

Two ways, pick whichever fits:

- **Export `.fdraft-theme`** (File panel → Export), then in normal Beta:
  **Settings → Admin → Preview Imported Theme**, and import that file.
  Good for quick QA — nothing is written to the repo.
- **Export to Repo**, or run `npm run theme:apply` on an exported file.
  Writes the real canonical theme into `public/event-themes/` for a
  proper build. Studio always asks before overwriting an existing file
  here, and backs it up as a revision first.

## Responsive Layout

Always check **Desktop**, **Tablet**, and **Mobile** before calling a
page done — placements don't automatically carry across breakpoints. Use
**Copy to Tablet/Mobile** to start from your Desktop layout, then adjust
what needs it.

## Asset Tips

- Transparent-background PNG or WebP for illustrations.
- SVG for small icons only.
- Keep image dimensions sensible — no need for anything larger than it'll
  ever render at.
- Simple, descriptive filenames (`pumpkin-lit.png`, not `IMG_4821.png`).
