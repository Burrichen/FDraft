# Patch Notes

### v1.2.1-beta.1 — Room for One More (Beta 1)

#### Added

- Drafts are alive now: you can add a film from your Watchlist straight into your current Draft. Every Watchlist card has an "Add to Draft" icon, and it always asks first, naming the film, so a mis-clicked poster can never change your Draft.
- No Draft on the go? The same icon offers to start one built around that film instead — you pick the difficulty and deadline as usual, and the film you chose is guaranteed to be in the Draft that comes out.
- Adding a film by hand ignores the restrictions that only ever applied to FDraft's own picking. If "Franchises in chronological order" would have stopped a sequel being rolled, you can still add that sequel deliberately. Films FDraft genuinely can't draft — already watched, not released yet, or with mismatched details — are still refused, with the reason on the icon.
- An "Undo last change" button on the Draft page reverses the most recent change to your Draft: a film you added, a re-roll, or a manual replacement. Press it again to step back through up to five recent changes. It costs nothing, and if you'd already marked the film watched, that's undone too — points, progress, completion and your Watchlist all go back with it.
- During an Event, eligible Watchlist films get a second Add icon in that Event's own colour, for adding them to your Event Draft rather than your normal one. It confirms with the Event named ("Add to Halloween Draft?"), so the two can never be confused.
- The Stats page has a new "Watched films by source" breakdown, showing how the Draft films you've watched got into your Drafts — Random, Challenge, DIY, Manually Added, Manual Replacement, Rerolled or Event — with a count and percentage for each. It covers every Draft you've ever had, not just the current one.

#### Changed

- A Draft's film count is no longer fixed. Your Draft page shows how many films are in it right now, and progress counts every film currently in it — add a film to a 10-film Draft and it becomes 11/11 to finish, not 10. Its difficulty never changes: a Medium Draft stays a Medium Draft.
- A Draft can hold up to 30 films. Once it's full, the Add icon says so rather than quietly refusing.
- Drafts you already had keep working exactly as they are, and FDraft now records how each of their films arrived so the new Stats breakdown has something to say about them. Where that genuinely can't be known for an older film, it's classified conservatively rather than guessed at.
- "F* You, It's January!" is untouched by all of this — there is no way to add films to your January Draft. You get what January gives you.

### v1.2.0 — The Event Season

#### Changed

FDraft's three seasonal Events — Halloween, Christmas, and "F* You, It's January!" — are now fully realized. Each gets its own themed page, join flow, and dedicated Draft type: Halloween draws from curated Horror and Kitsch film lists, Christmas splits between Classic and Christmas Adjacent, and January simply rolls one film from its own built-in list the instant you join, with no further Draft-building at all. Every Event now earns its own permanent point currency — Haunted, Festive, and Misery Points — on top of the usual Lifetime Point every Draft already earns, and every Event now closes properly: a themed goodbye screen and message once its season ends, tracked automatically year over year, with Draft History and a new Stats section keeping a permanent record of how you did. A normal Draft and an Event Draft can now run side by side — joining an Event never disturbs whatever you were already drafting.

"One At A Time" is a brand new way to build any Draft, Event or normal — add films one by one via Random, Choose My Own, or (for normal Drafts) a Challenge, reviewing and confirming each one before it's added, with no fixed film count required. Freeform is retired as a way to start a new Draft (old Freeform Drafts still show fine in History), and Halloween's own Draft simplifies from three linked pools down to two — Horror and Kitsch — matching Christmas's shape exactly. Every non-January Event Draft flow, fixed-size or One At A Time, now offers the same "Prefer items from my Watchlist" option: turn it on and FDraft fills as many slots as it can from films already on your watchlist before topping up from the full curated pool, never as a requirement.

Settings has been reorganised into clear, focused sections — Profile, General, Events, Watchlist & Metadata, Data & Backups, Updates, and Developer — and, along with the rest of the app, now makes far better use of the screen on large and ultra-wide desktop displays. A couple of Developer-only preview tools used while building this release — an Event art preview and a theme-file importer — have been removed now that they've served their purpose.

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
