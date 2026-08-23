import { getEventDateOverride } from "@/application/events/event-date-override-store";
import { resolveAdminMode } from "@/domain/profiles/profile";
import { SystemClock, type Clock } from "@/domain/time/clock";
import type { ProfileRepository } from "@/repositories/profile-repository";
import type { SettingsRepository } from "@/repositories/settings-repository";

/**
 * THE central "what time is it, for event-availability purposes" function
 * — see docs/updates, "PROMPT 17 — ADMIN MODE + TEMPORARY EVENT TEST
 * SWITCHER". Every `isEventAvailable`/`getAvailabilityCycleId` call site
 * must resolve its `now` through this function, not `new Date()` or a bare
 * `Clock`, so the Event Test Switcher's simulated date has exactly one
 * place it can take effect.
 *
 * Deliberately NOT typed or used as a `Clock` anywhere — `deps.clock` is
 * treated codebase-wide as "the real clock, injectable only for tests," so
 * this function only ever takes an optional `Clock` as its OWN real-time
 * fallback, never poses as one itself. That distinction is what keeps the
 * override from ever leaking into draft deadlines, watched-history
 * timestamps, backup `exportedAt`, metadata refresh timestamps, or any
 * other real timestamp in the app — none of that code calls this function.
 *
 * Re-checks Admin Mode fresh on every call and never mutates the stored
 * override, which is also what makes "turn Admin Mode off to immediately
 * suspend the override, turn it back on to restore it" work with no extra
 * code: the override is simply ignored while Admin Mode is off and
 * re-consulted the instant it's on again.
 */
export async function getEffectiveEventDate(
  repos: { settings: SettingsRepository; profiles: ProfileRepository },
  profileId: string,
  deps: { clock?: Clock } = {},
): Promise<Date> {
  const clock = deps.clock ?? new SystemClock();

  const profile = await repos.profiles.getById(profileId);
  if (!resolveAdminMode(profile?.settings.adminMode)) {
    return clock.now();
  }

  const override = await getEventDateOverride(repos, profileId);
  if (!override.enabled || !override.simulatedDate) {
    return clock.now();
  }

  const simulated = new Date(override.simulatedDate);
  return Number.isNaN(simulated.getTime()) ? clock.now() : simulated;
}
