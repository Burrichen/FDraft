"use client";

import { useEffect, useState } from "react";

const SKULL_VISIBLE_MS = 2600;
const FADE_MS = 200;

type Phase = "entering" | "visible" | "exiting";

/**
 * The "Haunted" button's one-time jumpscare (see docs/updates, "PROMPT 20
 * — HIGH-EFFORT HALLOWEEN UI + APPROVED EASTER EGGS" §"SECOND PRESS") — a
 * full-screen black overlay with a large original stylised skull, visible
 * for ~3 seconds total (including its own fade in/out), then gone. No
 * navigation, no reload, no data mutation, no sound, no flashing/strobe —
 * a single plain opacity transition. `onDismiss` fires once the fade-out
 * transition completes OR the user presses Escape (which moves straight
 * to the "exiting" phase rather than skipping the fade, so there's still
 * no hard/jarring cut). Every timer and the keydown listener are cleaned
 * up on unmount, so navigating away or switching profiles mid-animation
 * never leaves anything dangling.
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
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="text-halloween-cream size-40 sm:size-56"
      >
        <path
          fill="currentColor"
          d="M50 6c-20 0-34 14-34 32 0 11 5 18 10 24l-3 14a4 4 0 0 0 4 5h6l2-8h4l1 8h9l1-8h4l2 8h6a4 4 0 0 0 4-5l-3-14c5-6 10-13 10-24 0-18-14-32-34-32z"
        />
        <circle cx="36" cy="42" r="8" className="fill-black" />
        <circle cx="64" cy="42" r="8" className="fill-black" />
        <path fill="black" d="M46 58h8l-4 8z" />
      </svg>
    </div>
  );
}
