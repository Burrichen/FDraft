/**
 * Whether a runtime value is trustworthy enough to use for anything that
 * depends on it being a real film length — see docs/updates, v1.1.2, "Fix
 * unreleased-film handling": TMDB commonly reports `runtime: 0` for a film
 * that hasn't released yet and has no known runtime, and that must never
 * be treated as a genuine "0 minute" film. `null`, `0`, negative, and any
 * other non-positive value all mean the same thing — unknown/missing —
 * never a real duration. A single shared predicate so this reads the same
 * way everywhere runtime trustworthiness matters (a recommendation
 * criterion, a display line, a filter) instead of each place re-deriving
 * its own slightly different null-check.
 */
export function isTrustworthyRuntime(
  runtimeMinutes: number | null,
): runtimeMinutes is number {
  return runtimeMinutes !== null && runtimeMinutes > 0;
}
