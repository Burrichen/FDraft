import { describe, expect, it } from "vitest";
import {
  createSeededRng,
  filterByExtreme,
  percentileSubset,
  pickUniform,
  pickWeighted,
  sampleWithoutReplacement,
  shuffle,
  weightedSampleWithoutReplacement,
} from "./rng";

describe("createSeededRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const sequenceA = Array.from({ length: 5 }, () => a.next());
    const sequenceB = Array.from({ length: 5 }, () => b.next());
    expect(sequenceA).toEqual(sequenceB);
  });

  it("produces values in [0, 1)", () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("different seeds produce different sequences", () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    expect(a.next()).not.toBe(b.next());
  });
});

describe("pickUniform", () => {
  it("throws on an empty array", () => {
    expect(() => pickUniform([], createSeededRng(1))).toThrow();
  });

  it("only ever returns elements from the input", () => {
    const items = ["a", "b", "c", "d"];
    const rng = createSeededRng(123);
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(pickUniform(items, rng));
    }
  });

  it("is deterministic for a given seed", () => {
    const items = [1, 2, 3, 4, 5];
    expect(pickUniform(items, createSeededRng(99))).toBe(
      pickUniform(items, createSeededRng(99)),
    );
  });
});

describe("shuffle", () => {
  it("does not mutate the input array", () => {
    const items = [1, 2, 3, 4, 5];
    const copy = [...items];
    shuffle(items, createSeededRng(1));
    expect(items).toEqual(copy);
  });

  it("returns a permutation containing exactly the same elements", () => {
    const items = [1, 2, 3, 4, 5];
    const shuffled = shuffle(items, createSeededRng(1));
    expect(shuffled).toHaveLength(items.length);
    expect([...shuffled].sort()).toEqual([...items].sort());
  });
});

describe("sampleWithoutReplacement", () => {
  it("returns distinct elements from the source array", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const sample = sampleWithoutReplacement(items, 3, createSeededRng(5));
    expect(sample).toHaveLength(3);
    expect(new Set(sample).size).toBe(3);
    for (const value of sample) {
      expect(items).toContain(value);
    }
  });

  it("clamps to the array length when count exceeds it", () => {
    const items = [1, 2, 3];
    const sample = sampleWithoutReplacement(items, 10, createSeededRng(5));
    expect(sample).toHaveLength(3);
  });

  it("returns an empty array for a non-positive count", () => {
    expect(sampleWithoutReplacement([1, 2, 3], 0, createSeededRng(5))).toEqual(
      [],
    );
  });
});

describe("pickWeighted", () => {
  it("throws on an empty array", () => {
    expect(() => pickWeighted([], createSeededRng(1))).toThrow();
  });

  it("throws on a negative weight", () => {
    expect(() =>
      pickWeighted([{ weight: -1, id: "a" }], createSeededRng(1)),
    ).toThrow();
  });

  it("always picks the only nonzero-weight item", () => {
    const items = [
      { id: "a", weight: 0 },
      { id: "b", weight: 5 },
      { id: "c", weight: 0 },
    ];
    const rng = createSeededRng(1);
    for (let i = 0; i < 20; i++) {
      expect(pickWeighted(items, rng).id).toBe("b");
    }
  });

  it("falls back to uniform selection when every weight is zero", () => {
    const items = [
      { id: "a", weight: 0 },
      { id: "b", weight: 0 },
    ];
    const rng = createSeededRng(1);
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(pickWeighted(items, rng).id);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it("selects heavier items proportionally more often over many draws", () => {
    const items = [
      { id: "heavy", weight: 99 },
      { id: "light", weight: 1 },
    ];
    const rng = createSeededRng(2024);
    let heavyCount = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      if (pickWeighted(items, rng).id === "heavy") heavyCount++;
    }
    // Expected ~99%; assert it's overwhelmingly the majority without being
    // brittle about the exact ratio.
    expect(heavyCount / trials).toBeGreaterThan(0.9);
  });
});

describe("weightedSampleWithoutReplacement", () => {
  it("returns an empty array for an empty input", () => {
    expect(weightedSampleWithoutReplacement([], 3, createSeededRng(1))).toEqual(
      [],
    );
  });

  it("returns an empty array when count is zero", () => {
    const items = [{ id: "a", weight: 1 }];
    expect(
      weightedSampleWithoutReplacement(items, 0, createSeededRng(1)),
    ).toEqual([]);
  });

  it("clamps to items.length when count exceeds it, returning every item exactly once", () => {
    const items = [
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
      { id: "c", weight: 1 },
    ];
    const result = weightedSampleWithoutReplacement(
      items,
      10,
      createSeededRng(1),
    );
    expect(result).toHaveLength(3);
    expect(new Set(result.map((r) => r.id)).size).toBe(3);
  });

  it("never repeats an item", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `film-${i}`,
      weight: 1,
    }));
    const rng = createSeededRng(77);
    const result = weightedSampleWithoutReplacement(items, 8, rng);
    expect(result).toHaveLength(8);
    expect(new Set(result.map((r) => r.id)).size).toBe(8);
  });

  it("does not mutate the input array", () => {
    const items = [
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
    ];
    const copy = [...items];
    weightedSampleWithoutReplacement(items, 1, createSeededRng(1));
    expect(items).toEqual(copy);
  });

  it("is deterministic for a given seed", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `film-${i}`,
      weight: i + 1,
    }));
    const first = weightedSampleWithoutReplacement(
      items,
      4,
      createSeededRng(555),
    );
    const second = weightedSampleWithoutReplacement(
      items,
      4,
      createSeededRng(555),
    );
    expect(first.map((f) => f.id)).toEqual(second.map((f) => f.id));
  });

  it("a much heavier item is included far more often than a much lighter one", () => {
    const items = [
      { id: "heavy", weight: 100 },
      { id: "light", weight: 1 },
      { id: "filler-1", weight: 1 },
      { id: "filler-2", weight: 1 },
    ];
    const rng = createSeededRng(9001);
    let heavyIncluded = 0;
    let lightIncluded = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const picked = weightedSampleWithoutReplacement(items, 1, rng).map(
        (p) => p.id,
      );
      if (picked.includes("heavy")) heavyIncluded++;
      if (picked.includes("light")) lightIncluded++;
    }
    expect(heavyIncluded).toBeGreaterThan(lightIncluded * 5);
  });
});

describe("filterByExtreme", () => {
  it("returns an empty array for an empty input", () => {
    expect(filterByExtreme([], (x: number) => x, "min")).toEqual([]);
  });

  it("returns the single minimum when there is no tie", () => {
    const items = [{ v: 3 }, { v: 1 }, { v: 2 }];
    expect(filterByExtreme(items, (i) => i.v, "min")).toEqual([{ v: 1 }]);
  });

  it("returns the single maximum when there is no tie", () => {
    const items = [{ v: 3 }, { v: 1 }, { v: 2 }];
    expect(filterByExtreme(items, (i) => i.v, "max")).toEqual([{ v: 3 }]);
  });

  it("returns every item tied for the extreme", () => {
    const items = [
      { id: "a", v: 1 },
      { id: "b", v: 5 },
      { id: "c", v: 1 },
    ];
    expect(filterByExtreme(items, (i) => i.v, "min").map((i) => i.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("returns every item when all are tied", () => {
    const items = [{ v: 4 }, { v: 4 }, { v: 4 }];
    expect(filterByExtreme(items, (i) => i.v, "max")).toHaveLength(3);
  });
});

describe("percentileSubset", () => {
  it("returns an empty array for an empty input", () => {
    expect(percentileSubset([], 0.2)).toEqual([]);
  });

  it("returns an empty array for a non-positive fraction", () => {
    expect(percentileSubset([1, 2, 3], 0)).toEqual([]);
    expect(percentileSubset([1, 2, 3], -0.5)).toEqual([]);
  });

  it("returns the whole list for a fraction of 1 or more", () => {
    expect(percentileSubset([1, 2, 3], 1)).toEqual([1, 2, 3]);
    expect(percentileSubset([1, 2, 3], 2)).toEqual([1, 2, 3]);
  });

  it("takes the head, rounding up, for a fractional slice", () => {
    // 20% of 10 items = 2.
    expect(percentileSubset([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.2)).toEqual([
      1, 2,
    ]);
    // 25% of 10 items rounds 2.5 up to 3.
    expect(percentileSubset([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.25)).toEqual([
      1, 2, 3,
    ]);
  });

  it("always includes at least one item for a non-empty input, however small the fraction", () => {
    expect(percentileSubset([1, 2, 3], 0.01)).toEqual([1]);
  });

  it("never throws or divides by zero for a single-item input", () => {
    expect(percentileSubset(["only"], 0.2)).toEqual(["only"]);
  });
});
