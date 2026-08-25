import { describe, expect, it } from "vitest";
import {
  buildDecorationSeed,
  hashDecorationSeed,
  pickDecorationVariant,
  resolveDecorationLayout,
  type DecorationVariantOption,
  type EventDecorationLayout,
} from "./event-decoration-slots";

describe("pickDecorationVariant", () => {
  it("is deterministic: the same seed always returns the same variant", () => {
    const variants: DecorationVariantOption[] = [
      { assetId: "a", weight: 35 },
      { assetId: "b", weight: 25 },
      { assetId: "c", weight: 20 },
      { assetId: null, weight: 20 },
    ];
    const firstPick = pickDecorationVariant("stable-seed", variants);
    for (let i = 0; i < 20; i += 1) {
      expect(pickDecorationVariant("stable-seed", variants)).toBe(firstPick);
    }
  });

  it("different seeds are able to land on every declared option, including nothing", () => {
    const variants: DecorationVariantOption[] = [
      { assetId: "a", weight: 1 },
      { assetId: "b", weight: 1 },
      { assetId: null, weight: 1 },
    ];
    const picks = new Set<string | null>();
    for (let i = 0; i < 500; i += 1) {
      const variant = pickDecorationVariant(`seed-${i}`, variants);
      picks.add(variant === null ? "MISSING" : variant.assetId);
    }
    expect(picks).toEqual(new Set(["a", "b", null]));
  });

  it("a weight of 0 can never be picked", () => {
    const variants: DecorationVariantOption[] = [
      { assetId: "never", weight: 0 },
      { assetId: "always", weight: 1 },
    ];
    for (let i = 0; i < 200; i += 1) {
      expect(pickDecorationVariant(`seed-${i}`, variants)?.assetId).toBe(
        "always",
      );
    }
  });

  it("returns null when every option has zero (or negative) weight", () => {
    expect(
      pickDecorationVariant("seed", [
        { assetId: "a", weight: 0 },
        { assetId: "b", weight: -5 },
      ]),
    ).toBeNull();
  });

  it("returns null for an empty variant list", () => {
    expect(pickDecorationVariant("seed", [])).toBeNull();
  });

  it("a single, fully-weighted option is always picked regardless of seed", () => {
    const variants: DecorationVariantOption[] = [
      { assetId: "only", weight: 1 },
    ];
    for (let i = 0; i < 20; i += 1) {
      expect(pickDecorationVariant(`different-${i}`, variants)?.assetId).toBe(
        "only",
      );
    }
  });

  it("roughly respects relative weight across many seeds (statistical, not exact)", () => {
    const variants: DecorationVariantOption[] = [
      { assetId: "common", weight: 90 },
      { assetId: "rare", weight: 10 },
    ];
    let commonCount = 0;
    const total = 2000;
    for (let i = 0; i < total; i += 1) {
      if (pickDecorationVariant(`s${i}`, variants)?.assetId === "common") {
        commonCount += 1;
      }
    }
    const ratio = commonCount / total;
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(1);
  });
});

describe("hashDecorationSeed", () => {
  it("is a pure function of its input", () => {
    expect(hashDecorationSeed("halloween:page:profile-1")).toBe(
      hashDecorationSeed("halloween:page:profile-1"),
    );
  });

  it("different inputs usually hash differently", () => {
    expect(hashDecorationSeed("a")).not.toBe(hashDecorationSeed("b"));
  });
});

describe("buildDecorationSeed", () => {
  it("combines every input plus the slot name into one string", () => {
    const seed = buildDecorationSeed(
      {
        eventId: "halloween",
        layoutKey: "halloween-page",
        profileId: "profile-1",
        sessionSeed: "abc123",
      },
      "mid-right",
    );
    expect(seed).toBe("halloween:halloween-page:profile-1:abc123:mid-right");
  });

  it("falls back to a stable placeholder for a missing profile id", () => {
    const seed = buildDecorationSeed(
      {
        eventId: "halloween",
        layoutKey: "halloween-page",
        sessionSeed: "abc123",
      },
      "mid-right",
    );
    expect(seed).toBe("halloween:halloween-page:anon:abc123:mid-right");
  });

  it("two different slots in the same layout get different seeds, so they pick independently", () => {
    const inputs = {
      eventId: "halloween",
      layoutKey: "halloween-page",
      profileId: "profile-1",
      sessionSeed: "abc123",
    };
    expect(buildDecorationSeed(inputs, "mid-right")).not.toBe(
      buildDecorationSeed(inputs, "mid-left"),
    );
  });
});

describe("resolveDecorationLayout", () => {
  const layout: EventDecorationLayout = {
    "mid-right": {
      slot: "mid-right",
      visibleFrom: "lg",
      variants: [
        { assetId: "ghost", weight: 1 },
        { assetId: null, weight: 0 },
      ],
    },
    "mid-left": {
      slot: "mid-left",
      visibleFrom: "base",
      variants: [{ assetId: null, weight: 1 }],
    },
  };

  it("only includes slots that resolved to a real asset — 'nothing' slots are simply absent", () => {
    const resolved = resolveDecorationLayout(layout, {
      eventId: "halloween",
      layoutKey: "halloween-page",
      profileId: "profile-1",
      sessionSeed: "seed",
    });
    expect(resolved["mid-right"]?.variant.assetId).toBe("ghost");
    expect(resolved["mid-left"]).toBeUndefined();
  });

  it("is deterministic for the same inputs", () => {
    const inputs = {
      eventId: "halloween",
      layoutKey: "halloween-page",
      profileId: "profile-1",
      sessionSeed: "seed",
    };
    const first = resolveDecorationLayout(layout, inputs);
    const second = resolveDecorationLayout(layout, inputs);
    expect(first["mid-right"]?.variant).toBe(second["mid-right"]?.variant);
  });

  it("a different profile id can resolve independently from another profile's pick", () => {
    const variedLayout: EventDecorationLayout = {
      "mid-right": {
        slot: "mid-right",
        visibleFrom: "lg",
        variants: [
          { assetId: "a", weight: 1 },
          { assetId: "b", weight: 1 },
          { assetId: "c", weight: 1 },
        ],
      },
    };
    const base = {
      eventId: "halloween",
      layoutKey: "halloween-page",
      sessionSeed: "seed",
    };
    const picks = new Set(
      Array.from(
        { length: 10 },
        (_, i) =>
          resolveDecorationLayout(variedLayout, {
            ...base,
            profileId: `profile-${i}`,
          })["mid-right"]?.variant.assetId,
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });
});
