# Event Art Guide

How to edit Halloween/Christmas art without touching any code. Written for
someone editing files in git — not a framework explainer.

## 1. Where the files live

```
public/events/
  halloween/
    manifest.json      <- Halloween's config (see §2)
    modal/              <- art shown in the join popup
    interactives/        <- gravestone, pumpkin, candy bowl images
  christmas/
    manifest.json      <- Christmas's config (placeholder art only)
    modal/
    interactives/
    decorations/
```

- **Halloween assets** → `public/events/halloween/`
- **Christmas assets** → `public/events/christmas/` (Christmas isn't a real
  event yet — this is scaffolding/placeholder art only, see §8)
- **Manifests (the config that lists which files exist)** →
  `public/events/<event>/manifest.json`
- **Slot configs (what appears where, and how often)** → in code, under
  `src/components/events/` — see §4

## 2. How to replace an image

1. Find the file, e.g. `public/events/halloween/interactives/pumpkin-rotten.png`
2. Replace it with your new image, **using the exact same filename**.
3. Rebuild/run the app.
4. Done — the new art appears. No code or config edit needed.

## 3. Which files are safe to replace

| File type                                                     | Safe to just overwrite? | Notes                                                                                                                 |
| ------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| PNG / WebP images (`interactives/`, `modal/`, `decorations/`) | ✅ Yes                  | Same filename, transparent background if possible                                                                     |
| `manifest.json`                                               | ⚠️ Edit carefully       | It's a list of filenames — a typo breaks the link, see §7                                                             |
| Nav bar icons                                                 | ❌ Not a file today     | Halloween's nav icon is hand-coded (it animates on hover), not an image file. Ignore this one — it needs an engineer. |

## 4. How to change what appears in a slot

A "slot" is a named spot on the page (like `mid-right`) that can show one
of a few different pictures — or nothing.

Slot configs live here:

- `src/components/events/halloween-decoration-layout.ts` (Halloween)
- `src/components/events/christmas-decoration-layout.ts` (Christmas)

**Example — Halloween's `mid-right` slot today:**

```
mid-right can show: ghost-1, ghost-2, tiny-pumpkin, or nothing.
```

To change it, open the file, find `"mid-right":`, and edit the `variants`
list — add, remove, or reorder entries.

## 5. How to change the chance of something appearing

Each option has a `weight` — just a plain number. Bigger number = more
likely. They don't need to add up to 100, they're only compared to each
other.

```
{ assetId: "ghost-1", weight: 30 }   <- shows up more often
{ assetId: "ghost-2", weight: 10 }   <- shows up less often
```

Want something to almost always show? Give it a big weight. Want it rare?
Give it a small one.

## 6. How to remove something

Two options:

- **Remove one option** from a slot's list — delete that line.
- **Turn the whole slot off** — set its only option to nothing:
  ```
  variants: [{ assetId: null, weight: 1 }]
  ```
  (`assetId: null` means "show nothing here" — it's a real option, not a
  bug.)

## 7. How to add a new image

1. Copy your image into the right folder, e.g.
   `public/events/halloween/interactives/pumpkin-glowing.png`
2. Add it to `manifest.json` under the matching category:
   ```json
   "interactives": {
     "pumpkin-glowing": "interactives/pumpkin-glowing.png"
   }
   ```
3. To actually make it appear somewhere, add it as an option to a slot
   (see §4). This last step needs a tiny bit of code — ask an engineer if
   you're not sure.

## 8. How to preview Christmas (or another future event)

Christmas isn't turned on for real users — it's a scaffold used to prove
the art system works for more than Halloween. To see it:

1. Open the app → **Settings**.
2. Scroll to **Developer** → turn on **Admin Mode**.
3. Scroll down to **"Event art system (dev preview)"**.

This lists every event that has art registered (Halloween, Christmas, and
any future ones) with its icon, a count of its assets, and a live preview
of its decorations — all in one place, dev-only, no gameplay involved.

## 9. Tips for good assets

- Use a **transparent background** (PNG or WebP).
- Keep filenames **simple and lowercase-with-dashes** (`pumpkin-lit.png`,
  not `Pumpkin Lit FINAL v2.png`).
- Keep the image size sensible — a few hundred pixels wide is plenty;
  huge files just slow the app down.
- **PNG or WebP** are both fine. Avoid JPG (no transparency).

---

## Quick reference

| I want to...                     | Do this                                         |
| -------------------------------- | ----------------------------------------------- |
| Swap an existing picture         | Overwrite the file, same filename (§2)          |
| Add a brand-new picture          | Add the file + one line in `manifest.json` (§7) |
| Change what shows in a spot      | Edit that slot's `variants` list (§4)           |
| Make something rarer/more common | Change its `weight` number (§5)                 |
| Turn a spot off                  | Set it to `{ assetId: null, weight: 1 }` (§6)   |
| See Christmas's placeholder art  | Settings → Developer → Admin Mode (§8)          |

See also `public/events/README.md` for a shorter, folder-level version of
this same info.
