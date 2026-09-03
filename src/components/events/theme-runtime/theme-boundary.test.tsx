import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeBoundary } from "./theme-boundary";

function Bomb(): never {
  throw new Error("theme render exploded");
}

describe("ThemeBoundary", () => {
  afterEach(cleanup);

  it("renders the themed children when nothing fails", () => {
    render(
      <ThemeBoundary fallback={<p>Normal FDraft</p>}>
        <p>Themed content</p>
      </ThemeBoundary>,
    );
    expect(screen.getByText("Themed content")).toBeInTheDocument();
    expect(screen.queryByText("Normal FDraft")).not.toBeInTheDocument();
  });

  it("falls back to normal FDraft's own interface the moment themed content throws, instead of crashing the whole app", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    render(
      <ThemeBoundary fallback={<p>Normal FDraft</p>}>
        <Bomb />
      </ThemeBoundary>,
    );
    expect(screen.getByText("Normal FDraft")).toBeInTheDocument();
    expect(screen.queryByText("Themed content")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("reports the caught error via onError for host-side logging", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const onError = vi.fn();
    render(
      <ThemeBoundary fallback={<p>Normal FDraft</p>} onError={onError}>
        <Bomb />
      </ThemeBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "theme render exploded" }),
    );
    consoleError.mockRestore();
  });
});
