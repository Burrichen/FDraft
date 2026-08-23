import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WatchSessionUndoRecord } from "@/application/watchlist/local-watchlist-service";
import { useWatchUndo, WatchUndoProvider } from "./watch-undo-provider";

function record(
  overrides: Partial<WatchSessionUndoRecord> = {},
): WatchSessionUndoRecord {
  return {
    watchlistEntryId: "entry-1",
    filmId: "film-1",
    watchedHistoryId: "history-1",
    draftItemId: null,
    draftId: null,
    draftArchivedByThisAction: false,
    secondaryDraftCompletion: null,
    ...overrides,
  };
}

/** Exercises the real hook through real DOM events rather than calling context methods directly — proves the state genuinely round-trips through React re-renders, not just that the functions compile. */
function Probe({ entryId }: { entryId: string }) {
  const watchUndo = useWatchUndo();
  const pending = watchUndo.getRecord(entryId);

  return (
    <div>
      <p data-testid="status">{pending ? "pending" : "none"}</p>
      <button
        onClick={() =>
          watchUndo.registerWatched(record({ watchlistEntryId: entryId }))
        }
      >
        Mark watched
      </button>
      <button onClick={() => watchUndo.clearUndo(entryId)}>Undo</button>
      <p data-testid="pending-ids">
        {watchUndo.listPendingEntryIds().join(",")}
      </p>
      <p data-testid="archived-draft-id">
        {watchUndo.getPendingArchivedDraftId() ?? "none"}
      </p>
    </div>
  );
}

describe("WatchUndoProvider", () => {
  afterEach(() => cleanup());

  it("has no pending record for an entry that was never marked watched", () => {
    render(
      <WatchUndoProvider>
        <Probe entryId="entry-1" />
      </WatchUndoProvider>,
    );
    expect(screen.getByTestId("status")).toHaveTextContent("none");
  });

  it("registers and later clears a pending undo record for a specific entry", async () => {
    const user = userEvent.setup();
    render(
      <WatchUndoProvider>
        <Probe entryId="entry-1" />
      </WatchUndoProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Mark watched" }));
    expect(screen.getByTestId("status")).toHaveTextContent("pending");
    expect(screen.getByTestId("pending-ids")).toHaveTextContent("entry-1");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("status")).toHaveTextContent("none");
    expect(screen.getByTestId("pending-ids")).toHaveTextContent("");
  });

  it("keeps records for different entries independent", async () => {
    const user = userEvent.setup();
    function TwoEntries() {
      return (
        <>
          <Probe entryId="entry-a" />
          <Probe entryId="entry-b" />
        </>
      );
    }
    render(
      <WatchUndoProvider>
        <TwoEntries />
      </WatchUndoProvider>,
    );

    const [markA] = screen.getAllByRole("button", { name: "Mark watched" });
    await user.click(markA);

    const statuses = screen.getAllByTestId("status");
    expect(statuses[0]).toHaveTextContent("pending");
    expect(statuses[1]).toHaveTextContent("none");
  });

  it("surfaces the draft archived by a pending action via getPendingArchivedDraftId", () => {
    function RegisterArchived() {
      const watchUndo = useWatchUndo();
      return (
        <button
          onClick={() =>
            watchUndo.registerWatched(
              record({ draftId: "draft-1", draftArchivedByThisAction: true }),
            )
          }
        >
          Complete last film
        </button>
      );
    }
    render(
      <WatchUndoProvider>
        <RegisterArchived />
        <Probe entryId="entry-1" />
      </WatchUndoProvider>,
    );

    expect(screen.getByTestId("archived-draft-id")).toHaveTextContent("none");
    act(() => {
      screen.getByRole("button", { name: "Complete last film" }).click();
    });
    expect(screen.getByTestId("archived-draft-id")).toHaveTextContent(
      "draft-1",
    );
  });

  it("throws a clear error when used outside a WatchUndoProvider", () => {
    // Suppress React's expected error-boundary console noise for this one case.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => render(<Probe entryId="entry-1" />)).toThrow(
      "useWatchUndo must be used within a WatchUndoProvider",
    );
    consoleError.mockRestore();
  });
});
