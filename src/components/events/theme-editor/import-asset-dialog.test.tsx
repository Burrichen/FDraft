import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const checkEventArtWorkspaceAssetPathsMock = vi.fn();
const copyEventArtAssetMock = vi.fn();
vi.mock("@/infrastructure/tauri/event-art-workspace", () => ({
  checkEventArtWorkspaceAssetPaths: (...args: unknown[]) =>
    checkEventArtWorkspaceAssetPathsMock(...args),
  copyEventArtAsset: (...args: unknown[]) => copyEventArtAssetMock(...args),
}));

const { ImportAssetDialog } = await import("./import-asset-dialog");

const EVENT_OPTIONS = [
  { id: "common", label: "Common" },
  { id: "halloween", label: "Halloween" },
  { id: "christmas", label: "Christmas" },
];

function baseProps(
  overrides: Partial<Parameters<typeof ImportAssetDialog>[0]> = {},
) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    workspacePath: "/repo",
    sourcePath: "/Users/dev/Desktop/Ghost Peeking FINAL.png",
    eventOptions: EVENT_OPTIONS,
    onImported: vi.fn(),
    ...overrides,
  };
}

describe("ImportAssetDialog (EVENT STUDIO — PHASE 9 §3/§4/§5)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the source filename, a normalized default filename, and the computed destination", async () => {
    checkEventArtWorkspaceAssetPathsMock.mockResolvedValue({});
    render(<ImportAssetDialog {...baseProps()} />);

    expect(screen.getByText("Ghost Peeking FINAL.png")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("ghost-peeking-final.png"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText(
          "public/events/common/decorations/ghost-peeking-final.png",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("defaults the Event select to defaultEventId when given", () => {
    checkEventArtWorkspaceAssetPathsMock.mockResolvedValue({});
    render(
      <ImportAssetDialog {...baseProps({ defaultEventId: "halloween" })} />,
    );

    expect(screen.getByRole("combobox", { name: "Event" })).toHaveValue(
      "halloween",
    );
  });

  it("updates the destination preview when Event or Folder changes", async () => {
    checkEventArtWorkspaceAssetPathsMock.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ImportAssetDialog {...baseProps()} />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Event" }),
      "halloween",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Folder" }),
      "interactives",
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "public/events/halloween/interactives/ghost-peeking-final.png",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("imports on confirm when there is no collision, and reports the new relative path", async () => {
    checkEventArtWorkspaceAssetPathsMock.mockResolvedValue({
      "events/common/decorations/ghost-peeking-final.png": false,
    });
    copyEventArtAssetMock.mockResolvedValue({
      ok: true,
      relativePath: "events/common/decorations/ghost-peeking-final.png",
    });
    const onImported = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ImportAssetDialog {...baseProps({ onImported, onOpenChange })} />);

    const importButton = await screen.findByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).not.toBeDisabled());
    await user.click(importButton);

    await waitFor(() =>
      expect(copyEventArtAssetMock).toHaveBeenCalledWith(
        "/repo",
        "/Users/dev/Desktop/Ghost Peeking FINAL.png",
        "common",
        "decorations",
        "ghost-peeking-final.png",
      ),
    );
    expect(onImported).toHaveBeenCalledWith(
      "events/common/decorations/ghost-peeking-final.png",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("never silently overwrites a collision — offers Replace Existing / Import With New Name / Cancel instead of an Import button", async () => {
    checkEventArtWorkspaceAssetPathsMock.mockResolvedValue({
      "events/common/decorations/ghost-peeking-final.png": true,
    });
    const user = userEvent.setup();
    render(<ImportAssetDialog {...baseProps()} />);

    await waitFor(() =>
      expect(
        screen.getByText("A file already exists at this destination."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Import" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Replace Existing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import With New Name" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(copyEventArtAssetMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Replace Existing" }));
    await waitFor(() => expect(copyEventArtAssetMock).toHaveBeenCalled());
  });

  it("Cancel closes without ever importing", async () => {
    checkEventArtWorkspaceAssetPathsMock.mockResolvedValue({
      "events/common/decorations/ghost-peeking-final.png": true,
    });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<ImportAssetDialog {...baseProps({ onOpenChange })} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(copyEventArtAssetMock).not.toHaveBeenCalled();
  });

  it("surfaces a clear error message if the copy itself fails", async () => {
    checkEventArtWorkspaceAssetPathsMock.mockResolvedValue({});
    copyEventArtAssetMock.mockResolvedValue({
      ok: false,
      error: "Could not copy the file: disk full",
    });
    const user = userEvent.setup();
    render(<ImportAssetDialog {...baseProps()} />);

    const importButton = await screen.findByRole("button", { name: "Import" });
    await waitFor(() => expect(importButton).not.toBeDisabled());
    await user.click(importButton);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not copy the file: disk full",
      ),
    );
  });
});
