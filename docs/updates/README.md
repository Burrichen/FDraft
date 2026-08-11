# Update Planning

This folder is a scratchpad for product ideas, planned updates, and
quality-of-life improvements — somewhere to write things down the moment you
think of them, without needing to turn them into a real implementation prompt
right away.

Nothing in here is a commitment or a spec. `docs/product-spec.md` stays the
canonical source of truth for what the product does; this folder is just a
staging area for what it _might_ do next. When an idea is ready to build,
promote it into a numbered implementation prompt and check it off (or delete
it) here.

---

## Files

| File                                     | Use it for                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`major-updates.md`](./major-updates.md) | New features, structural changes — anything that would need its own implementation phase/prompt. |
| [`minor-updates.md`](./minor-updates.md) | Small tweaks, quality-of-life improvements, copy changes, one-off fixes.                         |

Not sure which one an idea belongs in? Ask: _would this need its own numbered
prompt, or could it ride along inside another one?_ Needs its own → major.
Rides along → minor.

Both files start with a **Quick Capture** checklist for zero-friction jotting,
and a more structured table/template below it for once an idea is worth
triaging.

---

## Status labels

Used consistently across both files:

| Label          | Meaning                                            |
| -------------- | -------------------------------------------------- |
| 💡 Idea        | Just captured. Not evaluated yet.                  |
| 🧭 Considering | Being thought through / discussed.                 |
| 📝 Planned     | Agreed on, waiting to be scheduled.                |
| 🚧 In Progress | Actively being implemented.                        |
| ✅ Done        | Shipped.                                           |
| ⏸️ On Hold     | Paused — revisit later.                            |
| ❌ Won't Do    | Decided against. Kept for the record, not deleted. |

## Priority labels

| Label     | Meaning           |
| --------- | ----------------- |
| 🔥 High   | Worth doing soon. |
| 🙂 Medium | Would be nice.    |
| 🧊 Low    | Someday / maybe.  |

---

## Adding an idea

1. Drop a line in **Quick Capture** the moment you think of it — no structure required.
2. When you're ready to triage it, move it into the table (minor) or copy the
   template (major), fill in status/priority/date, and remove it from Quick Capture.
3. Keep detail light until an idea is actually being planned — a sentence or two is enough.
