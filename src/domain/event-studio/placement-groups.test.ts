import { describe, expect, it } from "vitest";
import {
  expandSelectionWithGroups,
  findGroupContaining,
  groupPlacements,
  pruneMissingFromGroups,
  ungroupPlacements,
} from "./placement-groups";

describe("groupPlacements", () => {
  it("creates a new group from 2+ ids", () => {
    const groups = groupPlacements([], ["a", "b", "c"]);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0])).toEqual(new Set(["a", "b", "c"]));
  });

  it("is a no-op for fewer than 2 ids", () => {
    expect(groupPlacements([], ["a"])).toEqual([]);
  });

  it("merges any existing group that shares a member, rather than orphaning it", () => {
    const groups = groupPlacements([["a", "b"]], ["b", "c"]);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0])).toEqual(new Set(["a", "b", "c"]));
  });

  it("leaves an unrelated existing group untouched", () => {
    const groups = groupPlacements([["x", "y"]], ["a", "b"]);
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual(["x", "y"]);
  });
});

describe("ungroupPlacements", () => {
  it("dissolves a group entirely if any of its members are in the ungroup request", () => {
    const groups = ungroupPlacements([["a", "b", "c"]], ["b"]);
    expect(groups).toEqual([]);
  });

  it("leaves unrelated groups alone", () => {
    const groups = ungroupPlacements(
      [
        ["a", "b"],
        ["x", "y"],
      ],
      ["a"],
    );
    expect(groups).toEqual([["x", "y"]]);
  });
});

describe("findGroupContaining", () => {
  it("finds the group a placement belongs to", () => {
    expect(findGroupContaining([["a", "b"]], "b")).toEqual(["a", "b"]);
  });

  it("returns null for an ungrouped placement", () => {
    expect(findGroupContaining([["a", "b"]], "z")).toBeNull();
  });
});

describe("pruneMissingFromGroups", () => {
  it("drops ids that no longer exist", () => {
    const groups = pruneMissingFromGroups(
      [["a", "b", "c"]],
      new Set(["a", "c"]),
    );
    expect(groups).toEqual([["a", "c"]]);
  });

  it("dissolves a group that drops below 2 real members", () => {
    const groups = pruneMissingFromGroups([["a", "b"]], new Set(["a"]));
    expect(groups).toEqual([]);
  });
});

describe("expandSelectionWithGroups", () => {
  it("expands a single selected member to the whole group", () => {
    const expanded = expandSelectionWithGroups(
      [["a", "b", "c"]],
      new Set(["b"]),
    );
    expect(expanded).toEqual(new Set(["a", "b", "c"]));
  });

  it("leaves an ungrouped selection unchanged", () => {
    const expanded = expandSelectionWithGroups([], new Set(["a"]));
    expect(expanded).toEqual(new Set(["a"]));
  });
});
