/**
 * Ordinary VISUAL GROUPS — multiple FIXED (or weighted) placements
 * grouped so they move/resize/rotate together (see docs/updates, "EVENT
 * STUDIO — PHASE 5" §5). Deliberately NOT the same thing as a WEIGHTED
 * VARIANT GROUP (`variant-group-ops.ts`) — named distinctly in both code
 * and UI per §5's own explicit instruction ("Do not confuse ordinary
 * visual groups with weighted Variant Groups").
 *
 * A visual group is PURE STUDIO-SESSION STATE (a plain `string[][]` of
 * placement ids), never written into the `.fdraft-theme` file itself —
 * the same "editor-only, not production schema" choice already made for
 * locking (Phase 4). This is exactly what makes "Group transforms must
 * export deterministically" (§5) trivially true: transforming a group
 * only ever updates each member's own ALREADY-WELL-DEFINED placement
 * fields (offset/width/height/rotation — see `placement-geometry.ts`'s
 * px<->rem conversions), so the exported theme is indistinguishable from
 * one where the same edits were made one placement at a time. Reset per
 * page/state/breakpoint switch, the same convention `lockedPlacementIds`
 * already uses.
 */
export type PlacementGroups = readonly (readonly string[])[];

/** The group `placementId` belongs to, or `null` if it isn't in any group. */
export function findGroupContaining(
  groups: PlacementGroups,
  placementId: string,
): readonly string[] | null {
  return groups.find((group) => group.includes(placementId)) ?? null;
}

/**
 * Groups `ids` together — any EXISTING group that shares at least one
 * member with `ids` is absorbed into the new group (so grouping a mix of
 * "already in group A" and "ungrouped" items produces one merged group,
 * rather than silently orphaning A's other members or creating a
 * confusing overlapping group). Deduplicates; a group of fewer than 2
 * members isn't meaningful, so `ids.length < 2` is a no-op.
 */
export function groupPlacements(
  groups: PlacementGroups,
  ids: readonly string[],
): PlacementGroups {
  if (ids.length < 2) {
    return groups;
  }
  const idSet = new Set(ids);
  const untouched = groups.filter(
    (group) => !group.some((memberId) => idSet.has(memberId)),
  );
  const absorbed = groups.filter((group) =>
    group.some((memberId) => idSet.has(memberId)),
  );
  const merged = new Set<string>(ids);
  for (const group of absorbed) {
    for (const memberId of group) {
      merged.add(memberId);
    }
  }
  return [...untouched, Array.from(merged)];
}

/** Dissolves every group that has ANY overlap with `ids` — breaking apart a group is an all-or-nothing action on that whole group, not a partial removal of just the selected members. */
export function ungroupPlacements(
  groups: PlacementGroups,
  ids: readonly string[],
): PlacementGroups {
  const idSet = new Set(ids);
  return groups.filter(
    (group) => !group.some((memberId) => idSet.has(memberId)),
  );
}

/** Drops any group members that no longer exist (e.g. after a delete) — keeps `groups` from accumulating references to placements that were removed elsewhere. Groups reduced below 2 real members are dissolved entirely. */
export function pruneMissingFromGroups(
  groups: PlacementGroups,
  existingIds: ReadonlySet<string>,
): PlacementGroups {
  return groups
    .map((group) => group.filter((id) => existingIds.has(id)))
    .filter((group) => group.length >= 2);
}

/**
 * Expands a raw selection to include every member of any group that has
 * at least one member selected — clicking (or shift-clicking) ONE
 * grouped item selects the whole group for transform purposes, matching
 * how every mainstream design tool's "grouped object" selection behaves.
 */
export function expandSelectionWithGroups(
  groups: PlacementGroups,
  selectedIds: ReadonlySet<string>,
): Set<string> {
  const expanded = new Set(selectedIds);
  for (const group of groups) {
    if (group.some((id) => expanded.has(id))) {
      for (const id of group) {
        expanded.add(id);
      }
    }
  }
  return expanded;
}
