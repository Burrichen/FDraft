import { describe, expect, it } from "vitest";
import { resolveMatchMethod } from "./match-method";

describe("resolveMatchMethod", () => {
  it("returns 'manual' only for the exact literal value", () => {
    expect(resolveMatchMethod("manual")).toBe("manual");
  });

  it("defaults to 'automatic' for the normal case", () => {
    expect(resolveMatchMethod("automatic")).toBe("automatic");
  });

  it("defaults a record from before this field existed to 'automatic', never 'manual'", () => {
    expect(resolveMatchMethod(undefined)).toBe("automatic");
  });

  it("defaults any other unexpected value to 'automatic' rather than throwing", () => {
    expect(resolveMatchMethod(null)).toBe("automatic");
    expect(resolveMatchMethod("")).toBe("automatic");
    expect(resolveMatchMethod(42)).toBe("automatic");
    expect(resolveMatchMethod("MANUAL")).toBe("automatic");
  });
});
