import {
  CHRISTMAS_EVENT_ID,
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "@/domain/events/event-registry";

export interface EventAccent {
  /** Fill for a progress bar's indicator — see `DraftLifecycleView`'s film/time bars. */
  progressIndicatorClassName: string;
  /** An accented icon BUTTON's own classes (background, its paired foreground, hover) — see the Watchlist's Event Add action. */
  actionClassName: string;
}

/**
 * One accent per Event, for the places an Event's own colour has to be
 * applied to a shared component that hardcodes its own (see
 * `DRAFT_EVENT_PROGRESS_ACCENTS`, which this replaces, and docs/updates
 * "FDRAFT v1.2.1 — LIVING DRAFTS" Part 3 §4's Event-coloured Add action).
 *
 * These can't simply inherit an Event page's `.theme-*` token reroute: the
 * shared `Progress` and `Button` primitives resolve their own fill
 * utilities rather than reading `--primary`, so an accent has to be passed
 * in explicitly. Every entry uses that Event's ONE canonical accent token
 * in both roles, so a bar and a button on the same Event never disagree
 * about what colour that Event is.
 *
 * An Event absent here (Frontier/Signal) keeps FDraft's own default
 * styling everywhere — read generically by `getEventAccent`, never by a
 * per-event branch at the call site.
 */
const EVENT_ACCENTS: Record<string, EventAccent> = {
  [HALLOWEEN_EVENT_ID]: {
    progressIndicatorClassName: "bg-halloween-pumpkin",
    actionClassName:
      "bg-halloween-pumpkin text-halloween-pumpkin-foreground hover:bg-halloween-pumpkin/90",
  },
  [F_YOU_ITS_JANUARY_EVENT_ID]: {
    progressIndicatorClassName: "bg-january-ice",
    actionClassName:
      "bg-january-ice text-january-ice-foreground hover:bg-january-ice/90",
  },
  [CHRISTMAS_EVENT_ID]: {
    progressIndicatorClassName: "bg-christmas-snow",
    actionClassName:
      "bg-christmas-snow text-christmas-snow-foreground hover:bg-christmas-snow/90",
  },
};

/** That Event's accent, or `null` for a normal Draft and for any Event with no palette of its own. */
export function getEventAccent(eventId: string | null): EventAccent | null {
  return eventId ? (EVENT_ACCENTS[eventId] ?? null) : null;
}
