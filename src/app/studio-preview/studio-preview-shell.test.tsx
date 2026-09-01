import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HALLOWEEN_EVENT_ID } from "@/domain/events/event-registry";

vi.mock("@/lib/event-studio-build", () => ({ isEventStudioBuild: true }));

let searchParamValues: Record<string, string> = {};
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => searchParamValues[key] ?? null,
  }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { StudioPreviewShell } = await import("./studio-preview-shell");

function setParams(params: { page: string; state: string; preset?: string }) {
  searchParamValues = {
    db: `studio-preview-test-${crypto.randomUUID()}`,
    page: params.page,
    state: params.state,
    preset: params.preset ?? "default",
  };
}

describe("StudioPreviewShell — renders the REAL page component per fixture (EVENT STUDIO — PHASE 3 §3/§6/§8)", () => {
  afterEach(() => {
    cleanup();
  });

  it("watchlist / populated shows real seeded film titles", async () => {
    setParams({ page: "watchlist", state: "populated" });
    render(<StudioPreviewShell />);
    await waitFor(
      () => expect(screen.getByText("The Watchtower")).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });

  it("watchlist / empty shows no seeded film titles", async () => {
    setParams({ page: "watchlist", state: "empty" });
    render(<StudioPreviewShell />);
    await waitFor(
      () =>
        expect(
          screen.queryByText("Loading…") ??
            screen.queryByText("Preparing preview…"),
        ).not.toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText("The Watchtower")).not.toBeInTheDocument();
  });

  it("drafts / creation renders the REAL /drafts/new form, not the Drafts page's own empty state", async () => {
    setParams({ page: "drafts", state: "creation" });
    render(<StudioPreviewShell />);
    await waitFor(
      () => expect(screen.getByText("Start a draft")).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText("No active draft")).not.toBeInTheDocument();
  });

  it("drafts / active renders the active draft's own seeded films", async () => {
    setParams({ page: "drafts", state: "active" });
    render(<StudioPreviewShell />);
    await waitFor(
      () => expect(screen.getByText("The Watchtower")).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });

  it("eventPage / active for Halloween renders the REAL HalloweenPageClient", async () => {
    setParams({
      page: "eventPage",
      state: "active",
      preset: HALLOWEEN_EVENT_ID,
    });
    render(<StudioPreviewShell />);
    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", { name: "Halloween" }),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });

  it("eventPage / empty for January (not yet joined) shows the join prompt", async () => {
    setParams({
      page: "eventPage",
      state: "empty",
      preset: "f-you-its-january",
    });
    render(<StudioPreviewShell />);
    await waitFor(
      () => expect(screen.getByText("Available now")).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });

  it("endingModal for Halloween renders the real ending message text", async () => {
    setParams({
      page: "endingModal",
      state: "default",
      preset: HALLOWEEN_EVENT_ID,
    });
    render(<StudioPreviewShell />);
    await waitFor(
      () =>
        expect(
          screen.getByText(/dark cloud over FDraft finally parts/i),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });

  it("introModal for a preset with no natural window shows the not-applicable placeholder, never crashes", async () => {
    setParams({
      page: "introModal",
      state: "default",
      preset: "not-a-real-event",
    });
    render(<StudioPreviewShell />);
    await waitFor(
      () =>
        expect(
          screen.getByText(/isn't a registered Event/i),
        ).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });
});

describe("StudioPreviewShell — absent on a normal (non-studio) build", () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  it("shows nothing real, even with a fully valid db/page/state in the URL", async () => {
    vi.doMock("@/lib/event-studio-build", () => ({
      isEventStudioBuild: false,
    }));
    vi.resetModules();
    const { StudioPreviewShell: NormalBuildShell } =
      await import("./studio-preview-shell");
    setParams({ page: "watchlist", state: "populated" });

    render(<NormalBuildShell />);
    await waitFor(() =>
      expect(
        screen.getByText(/only available in FDraft \(Dev\)/i),
      ).toBeInTheDocument(),
    );
  });
});
