import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FilmMetadataLine } from "./film-metadata-line";

afterEach(cleanup);

describe("FilmMetadataLine", () => {
  it("shows a genuine runtime", () => {
    render(
      <FilmMetadataLine
        releaseYear={2020}
        runtimeMinutes={119}
        averageRating={null}
      />,
    );
    expect(screen.getByText(/119 min/)).toBeInTheDocument();
  });

  it("never shows '0 min' for a runtime of 0 — see docs/updates, v1.1.2, 'Fix unreleased-film handling'", () => {
    render(
      <FilmMetadataLine
        releaseYear={2028}
        runtimeMinutes={0}
        averageRating={null}
      />,
    );
    expect(screen.queryByText(/0 min/)).not.toBeInTheDocument();
    expect(screen.getByText("2028")).toBeInTheDocument();
  });

  it("omits runtime entirely for null, never as '0 min' or 'N/A'", () => {
    render(
      <FilmMetadataLine
        releaseYear={2020}
        runtimeMinutes={null}
        averageRating={null}
      />,
    );
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
    expect(screen.queryByText("N/A")).not.toBeInTheDocument();
  });
});
