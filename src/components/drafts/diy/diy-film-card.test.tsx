import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiyFilmCard, type DiySelectableFilmView } from "./diy-film-card";

afterEach(cleanup);

const FILM: DiySelectableFilmView = {
  entryId: "entry-1",
  filmId: "film-1",
  title: "Alpha",
  releaseYear: 2020,
  runtimeMinutes: 100,
  posterUrl: null,
  averageRating: 4,
  dateAdded: "2024-01-01",
  genres: null,
};

describe("DiyFilmCard", () => {
  it("is not pressed and shows no 'Selected' badge when not selected", () => {
    render(<DiyFilmCard film={FILM} selected={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();
  });

  it("is pressed and shows a 'Selected' badge when selected", () => {
    render(<DiyFilmCard film={FILM} selected onToggle={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("calls onToggle with this film's entryId when clicked, regardless of current selection state", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<DiyFilmCard film={FILM} selected={false} onToggle={onToggle} />);
    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("entry-1");
  });
});
