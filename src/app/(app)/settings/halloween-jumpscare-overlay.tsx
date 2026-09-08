"use client";

import { useEffect, useState } from "react";
import { EventArtImage } from "@/components/events/event-art-image";
import { HALLOWEEN_ART } from "@/components/events/halloween-art";

const SKULL_VISIBLE_MS = 2600;
const FADE_MS = 200;

type Phase = "entering" | "visible" | "exiting";

/**
 * The "Haunted" button's one-time jumpscare (see docs/updates, "PROMPT 20
 * — HIGH-EFFORT HALLOWEEN UI + APPROVED EASTER EGGS" §"SECOND PRESS") — a
 * full-screen black overlay with a large centred skeleton, visible for ~3
 * seconds total (including its own fade in/out), then gone. No
 * navigation, no reload, no data mutation, no sound, no flashing/strobe —
 * a single plain opacity transition. `onDismiss` fires once the fade-out
 * transition completes OR the user presses Escape (which moves straight
 * to the "exiting" phase rather than skipping the fade, so there's still
 * no hard/jarring cut). Every timer and the keydown listener are cleaned
 * up on unmount, so navigating away or switching profiles mid-animation
 * never leaves anything dangling.
 *
 * The skeleton is an ORDINARY BUNDLED PNG (see docs/updates, "FDRAFT
 * UPDATE 1 — REPLACEABLE HAUNTED-BUTTON SKELETON ASSET"), resolved
 * through Halloween's normal art pack — `HALLOWEEN_ART.
 * hauntedButtonSkeleton`, i.e.
 * `public/events/halloween/interactives/haunted-button-skeleton.png`.
 * This REPLACED a hand-drawn inline `<svg>` skull that lived in this
 * file: the artwork was code, so changing it meant editing a component.
 * Overwriting that one file (same filename) and rebuilding is now the
 * entire swap procedure, exactly like every other piece of Halloween art
 * (see `public/events/README.md`). Nothing here embeds base64, draws the
 * figure in CSS/SVG, or hard-codes any image dimension — and there is
 * deliberately no second source for this picture.
 *
 * The BLACK BACKGROUND is supplied here, by this overlay (`bg-black` on
 * a `fixed inset-0` element), never by the image — so a replacement PNG
 * is free to be a plain transparent-background illustration. The image is
 * rendered `object-contain` with `h-auto`/`w-auto` under viewport-relative
 * max bounds, so an arbitrary future replacement of any aspect ratio is
 * scaled down to fit and never stretched or cropped.
 *
 * If that file is missing or corrupt, `EventArtImage` hides the image
 * (rather than showing a broken-image icon) and `onLoadError` logs it —
 * and, critically, the ~3-second dismissal timer is driven entirely by
 * this component's own `phase` state machine, completely independent of
 * whether the image ever loaded, so a bad asset can never trap anyone on
 * a black screen.
 *
 * Modeled as an explicit three-phase state machine (`entering` →
 * `visible` → `exiting`) rather than a single boolean specifically to
 * avoid an off-by-one on mount: a boolean starting `false` (transparent)
 * is indistinguishable from "already told to dismiss," which would make
 * the very first render's effect run schedule `onDismiss` immediately.
 */
export function HalloweenJumpscareOverlay({
  onDismiss,
}: {
  onDismiss: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("entering");

  useEffect(() => {
    // Mount transparent, then flip to visible one tick later so the
    // opacity transition actually plays instead of snapping in. A plain
    // `setTimeout` rather than `requestAnimationFrame` — deliberately, so
    // this stays driven by the same fake-timer clock as every other timer
    // in this component under test, instead of racing a real animation
    // frame against advanced fake time. Guarded to only apply while still
    // "entering" — an Escape press in that first instant already moved
    // phase straight to "exiting", and this stale timer firing afterward
    // must never stomp that back to "visible".
    const timer = window.setTimeout(
      () =>
        setPhase((current) => (current === "entering" ? "visible" : current)),
      20,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "visible") return;
    const timer = window.setTimeout(
      () => setPhase("exiting"),
      SKULL_VISIBLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPhase("exiting");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (phase !== "exiting") return;
    const timer = window.setTimeout(onDismiss, FADE_MS);
    return () => window.clearTimeout(timer);
    // Only re-run when `phase` changes — `onDismiss` is expected to be
    // stable enough for one fire-once overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <div
      role="alertdialog"
      aria-label="A skull briefly appears"
      // `duration-200`/`motion-reduce:duration-0` (see docs/updates,
      // "PROMPT 21 — HALLOWEEN RELEASE HARDENING", §"Respect reduced
      // motion") — the transition DURATION lives entirely in these
      // Tailwind classes, never an inline style, specifically so the
      // `motion-reduce:` override can actually win (an inline
      // `transitionDuration` style would always beat any CSS class,
      // silently defeating the override). The overlay still shows/hides
      // at exactly the same moments either way, just without the animated
      // fade for a profile with the OS/browser reduced-motion preference.
      className="fixed inset-0 z-100 flex items-center justify-center bg-black transition-opacity duration-200 motion-reduce:duration-0"
      style={{ opacity: phase === "visible" ? 1 : 0 }}
    >
      <EventArtImage
        src={HALLOWEEN_ART.hauntedButtonSkeleton}
        data-testid="haunted-button-skeleton"
        // `object-contain` + `h-auto`/`w-auto` + max bounds only (never a
        // fixed width/height, and never `object-cover`): the file's own
        // intrinsic size and aspect ratio decide how it lays out, capped
        // to the viewport so a large replacement can't overflow and a
        // non-square one can't be distorted. See this component's own
        // doc comment.
        className="h-auto max-h-[60vh] w-auto max-w-[70vw] object-contain"
        onLoadError={() =>
          console.warn(
            `Haunted jumpscare art failed to load: ${HALLOWEEN_ART.hauntedButtonSkeleton}. The overlay still dismisses itself on schedule.`,
          )
        }
      />
    </div>
  );
}
