/**
 * Halloween's own rich join-modal body copy (see docs/updates, "PROMPT
 * B2.3 — HALLOWEEN JOIN MODAL COMPLETE REDESIGN" §3) — genuinely
 * word-level bold/orange emphasis that the shared, plain-string
 * `EventIntroContent.description`/`bullets` shape (still used by every
 * other event's generic rendering) can't express. Rendered by
 * `EventIntroDialog` via `EventVisualTheme.renderIntroContent` — a fully
 * generic hook mirroring `renderDecoration`'s own pattern — so this stays
 * the ONLY Halloween-specific file involved; the dialog component itself
 * gets no per-event branch. Replaces the generic description + bullets +
 * footer note entirely for Halloween; every other event's dialog is
 * completely unaffected.
 */
export function renderHalloweenIntroContent() {
  const emphasis = "text-halloween-pumpkin font-bold";

  return (
    <>
      <p className="text-foreground text-base sm:text-lg">
        <span className={emphasis}>Halloween</span> has arrived in the sleepy
        town of FDraft&hellip; With it comes a full{" "}
        <span className={emphasis}>seasonal event</span>!
      </p>

      <div className="space-y-2">
        <h3 className="text-foreground text-sm font-bold sm:text-base">
          Featuring:
        </h3>
        <ul className="text-foreground list-disc space-y-2 pl-5 text-sm sm:text-base">
          <li>
            A frightening dedicated{" "}
            <span className={emphasis}>Halloween draft page</span>
          </li>
          <li>
            <span className={emphasis}>Three creepy seasonal film pools</span>{" "}
            to draft from
          </li>
          <li>
            <span className={emphasis}>Seasonal decorations</span> across the
            app, with a few hidden{" "}
            <span className={emphasis}>interactions</span>
          </li>
        </ul>
      </div>

      <p className="text-muted-foreground text-xs">
        Not ready? You can <span className={emphasis}>opt in</span> later from{" "}
        <span className={emphasis}>Settings</span> while it&apos;s available.
      </p>
    </>
  );
}
