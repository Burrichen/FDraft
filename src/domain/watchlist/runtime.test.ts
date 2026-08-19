import { describe, expect, it } from "vitest";
import { isTrustworthyRuntime } from "./runtime";

describe("isTrustworthyRuntime", () => {
  it("treats a positive runtime as trustworthy", () => {
    expect(isTrustworthyRuntime(119)).toBe(true);
    expect(isTrustworthyRuntime(1)).toBe(true);
  });

  it("treats null as untrustworthy (unknown)", () => {
    expect(isTrustworthyRuntime(null)).toBe(false);
  });

  it("treats 0 as untrustworthy (unknown), never a genuine zero-length film", () => {
    expect(isTrustworthyRuntime(0)).toBe(false);
  });

  it("treats a negative value as untrustworthy", () => {
    expect(isTrustworthyRuntime(-5)).toBe(false);
  });
});
