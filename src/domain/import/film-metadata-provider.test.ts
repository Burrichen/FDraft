import { describe, expect, it } from "vitest";
import { nullFilmMetadataProvider } from "./film-metadata-provider";

describe("nullFilmMetadataProvider", () => {
  it("declares no supported capabilities", () => {
    expect(nullFilmMetadataProvider.supportedCapabilities).toEqual([]);
  });

  it("always resolves null rather than fabricating data", async () => {
    const result = await nullFilmMetadataProvider.lookup({
      title: "Some Film",
      releaseYear: 2020,
    });
    expect(result).toBeNull();
  });
});
