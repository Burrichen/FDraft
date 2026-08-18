# Patch Notes

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
