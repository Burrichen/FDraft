# Patch Notes

### v1.2.0-beta.9 — Trick or Treat (Beta 9)

#### Fixed

- Fixed a test that only ran correctly on macOS/Linux, breaking Windows CI — again nothing to do with app behaviour.

### v1.2.0-beta.8 — Trick or Treat (Beta 8)

#### Fixed

- Fixed a code-formatting check failure in the last build that had nothing to do with app behaviour — this release exists purely to get the pipeline green again.

### v1.2.0-beta.7 — Trick or Treat (Beta 7)

#### Added

- A Developer-only "FDraft Theme Preview" tool (Settings → Developer → Admin Mode) for trying out an exported seasonal theme file before it ships for real — no effect on ordinary use.

### v1.2.0-beta.6 — Trick or Treat (Beta 6)

#### Added

- Watching a film in a Halloween Draft now earns a permanent Haunted Point, and watching one in a January Draft now earns a permanent Misery Point — on top of the usual Lifetime Point, for every film, in any of Halloween's three pools.
- Halloween now has its own end-of-event moment: once the season closes for a profile who joined, a quiet goodbye screen appears (however FDraft is currently being used) with a "See you next year." button, and the year is tracked automatically (2026 is the 1st annual event).

#### Changed

- A finished Halloween Draft is now safely wrapped up the moment the season ends, whether or not it was fully watched — nothing is lost, and it stays visible in Draft History afterward.

### v1.2.0-beta.5 — Trick or Treat (Beta 5)

#### Changed

- Halloween's gravestone, pumpkin, and candy bowl now use real bundled artwork instead of hand-drawn shapes, including a new, genuinely-emptier "low" candy bowl state between medium and empty.
- Halloween's decorations — on its own page, in the join popup, and lightly on other pages — now vary a little from session to session instead of always looking exactly the same.
- Beta builds are now named "FDraft (Beta)" with a pale blue icon, so a beta install is never mistaken for a real release sitting next to it.

#### Added

- Added a Developer-only "Event art system" preview (Settings → Developer → Admin Mode) for checking future seasonal art, like an early Christmas placeholder, without turning it on for real.

### v1.2.0-beta.4 — Trick or Treat (Beta 4)

#### Changed

- Settings has been reorganised into clear sections — Profile, General, Events, Watchlist & Metadata, Data & Backups, Updates, and Developer — and now uses the available screen width on desktop instead of a single narrow column.
- Events in Settings is now much simpler: it only ever lists events that are actually running right now, each with its dates and a Join button, or a plain message when nothing is currently running.
- Testing-only tools (the simulated event date, and the two event-data refresh buttons) now live under Settings → Developer, and only appear once Admin Mode is turned on.

### v1.2.0-beta.3 — Trick or Treat (Beta 3)

#### Fixed

- Joining Halloween (or January) now reliably shows its navigation tab and page right away — previously it sometimes only appeared after reloading the app.
- The seasonal join invitation now reliably appears the moment an event first becomes available, instead of sometimes never appearing at all for a profile that had never joined anything before.
- An event's page and navigation tab no longer disappear early just because a Draft was created, completed, or the event's visual/gameplay settings were toggled — only actually leaving the event, or the season ending, removes them.

### v1.2.0-beta.2 — Trick or Treat (Beta 2)

#### Added

- You can now run a normal Draft and a Halloween Draft at the same time — joining Halloween no longer affects any Draft already in progress.
- The Halloween join invitation has been completely redesigned: much larger, with richer seasonal copy and decoration spread across the whole card.
- Stats now has a Points section showing your lifetime, misery, and haunted point totals with their own icons.
- Substantially improved seasonal artwork throughout Halloween: the gravestone, carve-able pumpkin (now with a genuinely decayed fourth state), and candy bowl all got a full redesign, plus more scattered decorations on the Halloween page and light seasonal touches elsewhere in the app.

#### Changed

- The Halloween page now shows your active Draft directly, the same way the normal Draft page does, instead of pointing you elsewhere.
- Halloween's deadline is now a single, clearly-shown date — 1 November at midnight in your own timezone — no matter when during the event you start your Draft.
- Event Settings now only lets you opt into events that are currently live, rather than listing every event whether or not it's running.
- "F\* You, It's January!" now uses a trash can icon in navigation; the snowflake is being saved for a future event.

#### Fixed

- "F\* You, It's January!" could sometimes still look active while you were on the Halloween page.

### v1.2.0-beta.1 — Trick or Treat (Beta)

#### Added

- A beta build for hands-on testing of the new Halloween Event, live 30 September – 31 October. Opt in from the header, or via a one-time invitation when the window opens.
- Halloween Draft: a new Draft type split across three linked pools — Halloween-adjacent films from your own Watchlist, plus a curated Horror list and a curated Kitsch list — with three sliders to choose how many films come from each.
- The Halloween page, its Draft, and the opt-in invitation get a seasonal pumpkin/purple theme, plus three small clickable extras to find: an old gravestone, a carve-able pumpkin, and a candy bowl.

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
