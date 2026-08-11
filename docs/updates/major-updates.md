# Major Updates

New features, structural changes, and anything substantial enough to need its
own implementation phase/prompt. See [README.md](./README.md) for status/priority
labels and how this differs from [minor-updates.md](./minor-updates.md).

---

## Quick Capture

Jot a title down the moment you think of it. Turn it into a full entry below
once it's worth fleshing out.

- [ ]
- [ ]
- [ ]

---

## Index

| Title                               | Status  | Priority  | Date Added |
| ----------------------------------- | ------- | --------- | ---------- |
| _Example — delete me_               | 💡 Idea | 🙂 Medium | YYYY-MM-DD |
| Optional cloud sync between devices | 💡 Idea | 🧊 Low    | 2026-08-11 |

---

## Template

Copy this block for each new idea, fill it in below, and add a row to the
index above.

### \<Title\>

- **Status:** 💡 Idea
- **Priority:** 🙂 Medium
- **Date added:** YYYY-MM-DD
- **Area:** _e.g. Watchlist / Drafts / Challenges / Import / Stats / Auth_

**Summary**

One or two sentences on what this is and why it matters.

**Notes**

- Open questions, considerations, links, related ideas, etc.

---

## Example — delete me

- **Status:** 💡 Idea
- **Priority:** 🙂 Medium
- **Date added:** YYYY-MM-DD
- **Area:** —

**Summary**

This is a placeholder entry showing the template above rendered. Delete it
once a real idea takes its place.

**Notes**

- —

### Optional cloud sync between devices

- **Status:** 💡 Idea
- **Priority:** 🧊 Low
- **Date added:** 2026-08-11
- **Area:** Backup / Profiles

**Summary**

FDraft is local-first by design (see docs/product-spec.md, "CANONICAL ARCHITECTURE" —
Prompt 9.5D): no account, no server-side database, cross-device movement handled
entirely by exporting/importing a portable `.fdraft` backup file (Phase 9.5C). An
optional, explicitly opt-in cloud sync layer — e.g. syncing a backup to a
user-provided storage location — could reduce the manual "export, transfer,
import" friction for people who use FDraft on more than one device.

**Notes**

- This must stay genuinely optional. The canonical architecture explicitly
  states core functionality works without any account or server, and this
  idea must never become a requirement for normal use.
- Would need its own numbered prompt if pursued — real design questions
  around conflict resolution (two devices both making changes offline),
  what "sync" even means for local-only concepts like device timezone, and
  what server/storage backend (if any) would host synced data.
- Do not promote this into docs/product-spec.md's canonical requirements
  unless the product owner explicitly decides to build it — see that
  document's own "CANONICAL ARCHITECTURE" section.

### \<Seasonal\>

- **Status:** 💡 A seasonal update
- **Priority:** 🙂 Medium
- **Date added:** YYYY-MM-DD
- **Area:** _e.g. Watchlist / Drafts / Challenges / Import / Stats / Auth_

**Summary**

Seasonal options that can generate specific watchlists

**Notes**

- Open questions, considerations, links, related ideas, etc.

---
