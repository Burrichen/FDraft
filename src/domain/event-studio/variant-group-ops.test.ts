import { describe, expect, it } from "vitest";
import {
  addVariantOption,
  computeVariantPercentages,
  convertToVariantGroup,
  createVariantOption,
  removeVariantOption,
  reorderVariantOption,
  updateVariantOption,
} from "./variant-group-ops";
import { createFixedPlacement } from "./placement-ops";

describe("convertToVariantGroup", () => {
  it("carries over every shared layout property unchanged", () => {
    const fixed = {
      ...createFixedPlacement("mid-right", "ghost"),
      offsetX: 2,
      offsetY: -1,
      rotation: 15,
      opacity: 0.9,
      anchor: "right-center" as const,
    };
    const group = convertToVariantGroup(fixed);
    expect(group.kind).toBe("weighted");
    expect(group.id).toBe("mid-right");
    expect(group.offsetX).toBe(2);
    expect(group.offsetY).toBe(-1);
    expect(group.rotation).toBe(15);
    expect(group.opacity).toBe(0.9);
    expect(group.anchor).toBe("right-center");
  });

  it("the original asset becomes the first, full-weight variant — nothing is lost on conversion", () => {
    const fixed = createFixedPlacement("p1", "ghost-asset");
    const group = convertToVariantGroup(fixed);
    expect(group.variants).toHaveLength(1);
    expect(group.variants[0].assetId).toBe("ghost-asset");
    expect(group.variants[0].weight).toBe(100);
  });
});

describe("createVariantOption", () => {
  it("supports a real asset option", () => {
    const option = createVariantOption([], "pumpkin", "pumpkin");
    expect(option.assetId).toBe("pumpkin");
    expect(option.weight).toBeGreaterThan(0);
  });

  it("supports an explicit 'Nothing' option (assetId: null)", () => {
    const option = createVariantOption([], null, "nothing");
    expect(option.assetId).toBeNull();
  });

  it("gives every option a unique id, never colliding with an existing one", () => {
    const option = createVariantOption(["ghost"], "ghost-asset", "ghost");
    expect(option.id).not.toBe("ghost");
  });
});

describe("addVariantOption / removeVariantOption / updateVariantOption", () => {
  const base = convertToVariantGroup(createFixedPlacement("p1", "ghost"));

  it("adds an option to the end", () => {
    const option = createVariantOption(
      base.variants.map((v) => v.id),
      null,
      "nothing",
    );
    const updated = addVariantOption(base, option);
    expect(updated.variants).toHaveLength(2);
    expect(updated.variants[1].id).toBe(option.id);
  });

  it("removes exactly the matching option", () => {
    const option = createVariantOption(
      base.variants.map((v) => v.id),
      null,
      "nothing",
    );
    const withTwo = addVariantOption(base, option);
    const updated = removeVariantOption(withTwo, option.id);
    expect(updated.variants).toHaveLength(1);
  });

  it("updates only the matching option's weight", () => {
    const updated = updateVariantOption(base, base.variants[0].id, (v) => ({
      ...v,
      weight: 55,
    }));
    expect(updated.variants[0].weight).toBe(55);
  });
});

describe("reorderVariantOption", () => {
  function threeOptions() {
    let group = convertToVariantGroup(createFixedPlacement("p1", "a"));
    group = addVariantOption(
      group,
      createVariantOption(
        group.variants.map((v) => v.id),
        "b",
        "b",
      ),
    );
    group = addVariantOption(
      group,
      createVariantOption(
        group.variants.map((v) => v.id),
        "c",
        "c",
      ),
    );
    return group;
  }

  it("moves an option up/down within the list", () => {
    const group = threeOptions();
    const ids = group.variants.map((v) => v.id);
    const movedUp = reorderVariantOption(group, ids[1], "up");
    expect(movedUp.variants.map((v) => v.id)).toEqual([ids[1], ids[0], ids[2]]);
  });

  it("is a no-op past either end", () => {
    const group = threeOptions();
    const ids = group.variants.map((v) => v.id);
    const result = reorderVariantOption(group, ids[0], "up");
    expect(result.variants.map((v) => v.id)).toEqual(ids);
  });
});

describe("computeVariantPercentages", () => {
  it("returns the literal percentages when weights already sum to 100", () => {
    const percentages = computeVariantPercentages([
      {
        id: "a",
        assetId: "a",
        weight: 35,
        scale: null,
        opacityOverride: null,
        offsetXAdjustment: 0,
        offsetYAdjustment: 0,
        rotationAdjustment: 0,
      },
      {
        id: "b",
        assetId: "b",
        weight: 25,
        scale: null,
        opacityOverride: null,
        offsetXAdjustment: 0,
        offsetYAdjustment: 0,
        rotationAdjustment: 0,
      },
      {
        id: "c",
        assetId: null,
        weight: 40,
        scale: null,
        opacityOverride: null,
        offsetXAdjustment: 0,
        offsetYAdjustment: 0,
        rotationAdjustment: 0,
      },
    ]);
    expect(percentages).toEqual([
      { optionId: "a", percentage: 35 },
      { optionId: "b", percentage: 25 },
      { optionId: "c", percentage: 40 },
    ]);
  });

  it("normalizes weights that don't sum to 100, and the result always sums to exactly 100", () => {
    const percentages = computeVariantPercentages([
      {
        id: "a",
        assetId: "a",
        weight: 1,
        scale: null,
        opacityOverride: null,
        offsetXAdjustment: 0,
        offsetYAdjustment: 0,
        rotationAdjustment: 0,
      },
      {
        id: "b",
        assetId: "b",
        weight: 1,
        scale: null,
        opacityOverride: null,
        offsetXAdjustment: 0,
        offsetYAdjustment: 0,
        rotationAdjustment: 0,
      },
      {
        id: "c",
        assetId: "c",
        weight: 1,
        scale: null,
        opacityOverride: null,
        offsetXAdjustment: 0,
        offsetYAdjustment: 0,
        rotationAdjustment: 0,
      },
    ]);
    const sum = percentages.reduce((total, p) => total + p.percentage, 0);
    expect(sum).toBe(100);
  });

  it("every option is 0% when every weight is 0 (never NaN/divide-by-zero)", () => {
    const percentages = computeVariantPercentages([
      {
        id: "a",
        assetId: "a",
        weight: 0,
        scale: null,
        opacityOverride: null,
        offsetXAdjustment: 0,
        offsetYAdjustment: 0,
        rotationAdjustment: 0,
      },
    ]);
    expect(percentages).toEqual([{ optionId: "a", percentage: 0 }]);
  });
});
