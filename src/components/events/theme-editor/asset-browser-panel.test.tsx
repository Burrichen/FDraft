import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const scanMock = vi.fn();
const readMock = vi.fn();
vi.mock("@/infrastructure/tauri/event-art-workspace", () => ({
  scanEventArtWorkspaceAssets: (...args: unknown[]) => scanMock(...args),
  readEventArtWorkspaceAsset: (...args: unknown[]) => readMock(...args),
}));

const { AssetBrowserPanel } = await import("./asset-browser-panel");

const HALLOWEEN_ASSET = {
  relativePath: "events/halloween/interactives/pumpkin-lit.png",
  eventId: "halloween",
  category: "interactives",
  fileName: "pumpkin-lit.png",
};
const CHRISTMAS_ASSET = {
  relativePath: "events/christmas/decorations/lights.svg",
  eventId: "christmas",
  category: "decorations",
  fileName: "lights.svg",
};

describe("AssetBrowserPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a connect prompt instead of scanning when no workspace is connected", () => {
    render(<AssetBrowserPanel workspacePath={null} onPlaceAsset={vi.fn()} />);
    expect(
      screen.getByText(/Connect an Event Art Workspace/i),
    ).toBeInTheDocument();
    expect(scanMock).not.toHaveBeenCalled();
  });

  it("scans on mount and lists found assets with their filter/event id", async () => {
    scanMock.mockResolvedValue([HALLOWEEN_ASSET, CHRISTMAS_ASSET]);
    readMock.mockResolvedValue("data:image/png;base64,AAAA");

    render(<AssetBrowserPanel workspacePath="/repo" onPlaceAsset={vi.fn()} />);

    await waitFor(() => expect(scanMock).toHaveBeenCalledWith("/repo"));
    await waitFor(() =>
      expect(screen.getByText("pumpkin lit")).toBeInTheDocument(),
    );
    expect(screen.getByText("lights")).toBeInTheDocument();
  });

  it("Refresh Assets re-runs the scan", async () => {
    scanMock.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<AssetBrowserPanel workspacePath="/repo" onPlaceAsset={vi.fn()} />);
    await waitFor(() => expect(scanMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /refresh assets/i }));
    await waitFor(() => expect(scanMock).toHaveBeenCalledTimes(2));
  });

  it("filtering by an event shows that event's assets — never a different event's", async () => {
    scanMock.mockResolvedValue([HALLOWEEN_ASSET, CHRISTMAS_ASSET]);
    readMock.mockResolvedValue(null);
    const user = userEvent.setup();

    render(<AssetBrowserPanel workspacePath="/repo" onPlaceAsset={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("pumpkin lit")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Halloween" }));
    expect(screen.getByText("pumpkin lit")).toBeInTheDocument();
    expect(screen.queryByText("lights")).not.toBeInTheDocument();
  });

  it("search narrows the visible assets by filename", async () => {
    scanMock.mockResolvedValue([HALLOWEEN_ASSET, CHRISTMAS_ASSET]);
    readMock.mockResolvedValue(null);
    const user = userEvent.setup();

    render(<AssetBrowserPanel workspacePath="/repo" onPlaceAsset={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("pumpkin lit")).toBeInTheDocument(),
    );

    await user.type(
      screen.getByRole("searchbox", { name: /search assets/i }),
      "lights",
    );
    expect(screen.queryByText("pumpkin lit")).not.toBeInTheDocument();
    expect(screen.getByText("lights")).toBeInTheDocument();
  });

  it("clicking an asset card calls onPlaceAsset with its relative path", async () => {
    scanMock.mockResolvedValue([HALLOWEEN_ASSET]);
    readMock.mockResolvedValue(null);
    const onPlaceAsset = vi.fn();
    const user = userEvent.setup();

    render(
      <AssetBrowserPanel workspacePath="/repo" onPlaceAsset={onPlaceAsset} />,
    );
    await waitFor(() =>
      expect(screen.getByText("pumpkin lit")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("pumpkin lit"));
    expect(onPlaceAsset).toHaveBeenCalledWith(
      "events/halloween/interactives/pumpkin-lit.png",
      null,
    );
  });

  it("EVENT STUDIO — PHASE 7 §7: never re-fetches a thumbnail already loaded, even after toggling filters back and forth", async () => {
    scanMock.mockResolvedValue([HALLOWEEN_ASSET, CHRISTMAS_ASSET]);
    readMock.mockResolvedValue("data:image/png;base64,AAAA");
    const user = userEvent.setup();

    render(<AssetBrowserPanel workspacePath="/repo" onPlaceAsset={vi.fn()} />);
    await waitFor(() =>
      expect(readMock).toHaveBeenCalledWith(
        "/repo",
        "events/halloween/interactives/pumpkin-lit.png",
      ),
    );
    const callsAfterInitialLoad = readMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Christmas" }));
    await waitFor(() => expect(screen.getByText("lights")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Halloween" }));
    await waitFor(() =>
      expect(screen.getByText("pumpkin lit")).toBeInTheDocument(),
    );

    // Both assets were already fetched once during the initial "All" view —
    // switching filters back and forth reads the SAME cached thumbnails,
    // never issuing new IPC reads for files it already has.
    expect(readMock).toHaveBeenCalledTimes(callsAfterInitialLoad);
  });

  it("re-fetches thumbnails after a Refresh Assets scan (a file may have been replaced under the same name)", async () => {
    scanMock.mockResolvedValue([HALLOWEEN_ASSET]);
    readMock.mockResolvedValue("data:image/png;base64,AAAA");
    const user = userEvent.setup();

    render(<AssetBrowserPanel workspacePath="/repo" onPlaceAsset={vi.fn()} />);
    await waitFor(() => expect(readMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /refresh assets/i }));
    await waitFor(() => expect(readMock).toHaveBeenCalledTimes(2));
  });

  it("an asset card is draggable and carries its relative path as drag data", async () => {
    scanMock.mockResolvedValue([HALLOWEEN_ASSET]);
    readMock.mockResolvedValue(null);
    render(<AssetBrowserPanel workspacePath="/repo" onPlaceAsset={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("pumpkin lit")).toBeInTheDocument(),
    );
    const card = screen.getByText("pumpkin lit").closest("button")!;
    expect(card).toHaveAttribute("draggable", "true");
  });
});
