/**
 * Populates the shared Event Art registry (`event-art-registry.tsx`) —
 * imported exactly once, for its side effects only, from `app-shell.tsx`
 * (mounted once above every routed page). Each event's own registration
 * module runs its `registerEventArt(...)` call the moment it's imported;
 * this file's only job is to be the one place that imports every one of
 * them, so adding a future event (Carnival, ...) is a one-line addition
 * here, not a hunt through the app for where registration "happens to"
 * get triggered.
 */
import "./halloween-art-registration";
import "./christmas-art-registration";
