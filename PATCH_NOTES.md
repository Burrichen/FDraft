# Patch Notes

### v1.1.3 — Recast

#### Added

- Random films in an active draft can now be replaced — a small pen icon opens a full poster-grid picker to hand-pick a specific replacement, and a reroll icon draws a new random film using the same rules as normal drafting. Challenge Films and manually-picked films stay locked.
- Replacing a film you'd already marked watched simply removes it from this draft's credit — it asks you to confirm first, and never erases the film from your actual watch history.

### v1.1.2 — Second Take

#### Added

- Added a "Re-import Letterboxd Watchlist" action in Settings — bring in a newer export and replace your watchlist membership, without touching your watched history, ratings, drafts, or settings. Requires confirmation, and leaves your current watchlist untouched if it fails or you cancel.
- "Pick Your Own" Challenge Film now opens a proper full poster-grid picker (with search and sort/filter) instead of a cramped inline list — the same picker DIY Draft itself uses.

#### Fixed

- Future/unannounced films (e.g. an unreleased sequel) could still appear in DIY recommendations and draft candidates if they hadn't been enriched with metadata yet — release eligibility now also checks the film's own release year as a fallback.
- A 0-minute runtime (how some providers mark an upcoming film with no known runtime yet) could wrongly qualify for "I want something short" or display as "0 min" — runtime is now only trusted when it's a genuine, positive value.
- Build Your Own Draft could hide valid sequels/later franchise entries from its picker and search (e.g. only the first Mission: Impossible film would show up) — DIY selection no longer applies the random-draft rule that skips ahead of an unwatched earlier entry; that rule still applies to auto-generated drafts.
- "I want something recent" no longer shows a redundant "Released in <year>" line — the year is already shown next to the title.
- Movie posters in Build Your Own Draft could render with inconsistent spacing at narrower widths; the grid now keeps a consistent gap everywhere.

### v1.1.1 — Take Your Pick

#### Added

- "Need ideas?" now asks three more questions: "I want something short", "I want something recent", and "Take me back" — each shows why a film qualified (rating, watchlist age, runtime, or release year) and only ever suggests, never selects, a film for you.
- Challenge slots can now be "Pick Your Own" — choose it in "Choose My Challenge" (with a film picker for exactly that many slots), or let it come up under "Decide My Challenge For Me" by pre-selecting optional backup films. Once picked, it behaves exactly like any other Challenge Film.

#### Fixed

- "Need ideas?" could recommend a film that was already watched, or no longer on your watchlist at all — recommendations now strictly share the same eligibility as everything else a draft can pick from.
- Re-importing your watchlist could silently put an already-watched film back on it; a film you've marked watched now stays watched through a re-import.
- "Highest rated" could show a film with no known rating, and similar gaps could slip into other recommendations — every recommendation now requires trustworthy data for whatever it's judging (a real rating, runtime, or release year), rather than guessing.

### v1.1.0 — Pick Your Own

#### Added

- Added "Build My Own Draft" as a new option when starting a draft — pick every film yourself from your watchlist instead of a random roll, with an optional "Need ideas?" panel (highest rated, longest on your watchlist) that only ever suggests films, never selects one for you.

#### Fixed

- Unreleased films could occasionally be drafted; they're now checked against their actual release date/status and excluded until they're out.
- A later entry in a film series (e.g. a sequel) could be drafted ahead of an earlier entry you hadn't watched yet; the earlier entry is now correctly preferred.
- A small number of drafted films showed a poster, runtime, or genres belonging to a different, similarly-titled film; this metadata mismatch is now detected and the film is skipped instead.
- Manually-added films showed up as "Random" in Draft History; they're now labeled "Manual".
- The startup update popup was redesigned with clearer FDraft-specific copy, and no longer shows generic installer/download instructions when a release's notes aren't usable.

### v1.0.4 — God Mode

#### Added

- Added a profile-specific "Admin Mode" setting for temporary/testing use — it will eventually be removed.
- When Admin Mode is on, an active draft can be regenerated from the Draft page, deleting it with no points awarded and reverting any films watched to complete it.

#### Changed

- Trimmed some explanatory subtitle copy on the Stats and History pages.

### v1.0.3 — Now Updating

#### Added

- A startup popup now appears when a new version is found automatically, showing that version's own patch notes with the option to update now, be reminded later, or stop seeing these popups.
- Manual and automatic update checks now both show the newer version's patch notes, not just its bare version number.
- Added a "Show a popup when a new update is found automatically" setting, so the startup popup can be turned back on after opting out.

#### Fixed

- Automatic update checks now actually run on startup — previously a check that ran once (on first install, or from a manual check) silently blocked every other automatic check for the next 6 hours, so a genuinely new release often only ever turned up via the manual "Check for Updates" button.

### v1.0.2 — The Green Pen Patch

#### Added

- Drafts can now be given custom names using the new edit button, with those names carried into History.
- Added Watchlist title search.
- Films can now be manually added from the Watchlist to an active draft.
- Added an optional "Franchises in chronological order?" setting.
- Added an explanation on drafted films whenever franchise ordering changes the original roll.
- Added a metadata-safe Re-roll button for drafted films that have no metadata.
- Added an in-app Patch Notes viewer under Settings → Updates.

#### Changed

- Default draft titles now include the month, e.g. `August Medium Draft`.
- The Films progress bar is now green while Days remains blue.

#### Fixed

- History no longer displays films that have not actually been watched.
