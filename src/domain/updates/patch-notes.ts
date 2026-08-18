/**
 * FDraft's in-app Patch Notes viewer (see docs/updates, "PATCH NOTES IN
 * SETTINGS") reads from this single, versioned data source rather than
 * scattered JSX, so the app and the repository-level `PATCH_NOTES.md`
 * (repo root) can be kept in sync by construction: whenever this list
 * changes, the same wording is copied into that file's matching section.
 *
 * Ordered newest-first. Only entries that genuinely shipped belong here —
 * never a placeholder or a guessed-at historical entry for a version that
 * predates this viewer.
 */
export interface PatchNoteSection {
  heading: "Added" | "Changed" | "Fixed";
  items: string[];
}

export interface PatchNoteEntry {
  version: string;
  nickname: string;
  sections: PatchNoteSection[];
}

export const PATCH_NOTES: PatchNoteEntry[] = [
  {
    version: "1.0.3",
    nickname: "Now Updating",
    sections: [
      {
        heading: "Added",
        items: [
          "A startup popup now appears when a new version is found automatically, showing that version's own patch notes with the option to update now, be reminded later, or stop seeing these popups.",
          "Manual and automatic update checks now both show the newer version's patch notes, not just its bare version number.",
          'Added a "Show a popup when a new update is found automatically" setting, so the startup popup can be turned back on after opting out.',
        ],
      },
      {
        heading: "Fixed",
        items: [
          'Automatic update checks now actually run on startup — previously a check that ran once (on first install, or from a manual check) silently blocked every other automatic check for the next 6 hours, so a genuinely new release often only ever turned up via the manual "Check for Updates" button.',
        ],
      },
    ],
  },
  {
    version: "1.0.2",
    nickname: "The Green Pen Patch",
    sections: [
      {
        heading: "Added",
        items: [
          "Drafts can now be given custom names using the new edit button, with those names carried into History.",
          "Added Watchlist title search.",
          "Films can now be manually added from the Watchlist to an active draft.",
          'Added an optional "Franchises in chronological order?" setting.',
          "Added an explanation on drafted films whenever franchise ordering changes the original roll.",
          "Added a metadata-safe Re-roll button for drafted films that have no metadata.",
          "Added an in-app Patch Notes viewer under Settings → Updates.",
        ],
      },
      {
        heading: "Changed",
        items: [
          "Default draft titles now include the month, e.g. `August Medium Draft`.",
          "The Films progress bar is now green while Days remains blue.",
        ],
      },
      {
        heading: "Fixed",
        items: [
          "History no longer displays films that have not actually been watched.",
        ],
      },
    ],
  },
];
