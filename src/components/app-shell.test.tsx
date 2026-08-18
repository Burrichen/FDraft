import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { ProfileService } from "@/application/profiles/profile-service";

/**
 * Proves the core claims of "REMOVE AUTHENTICATION" (see
 * docs/product-spec.md, Prompt 9.5B): opening the app renders real content
 * immediately — no login redirect, no session/auth object anywhere in the
 * render path — and shows the first-run screen (not a login form) when no
 * local profile exists yet.
 */
describe("AppShell (real fake-indexeddb, no auth/session anywhere)", () => {
  // AppShell fires a one-shot January manifest refresh on mount (see
  // `january-manifest-service.ts`) — stubbed here so this suite never
  // makes a real network call; the fallback behaviour that stub exercises
  // is itself covered by `january-manifest-service.test.ts`.
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("no network in tests")),
    );
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("first launch: shows the first-run screen, never a login page", async () => {
    render(
      <AppShell databaseName={crypto.randomUUID()}>
        <p>Watchlist content</p>
      </AppShell>,
    );

    await waitFor(() =>
      expect(screen.getByText("Welcome to FDraft")).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Watchlist content")).not.toBeInTheDocument();
  });

  it("after creating a profile, renders the real app content directly — no redirect, no intermediate screen", async () => {
    const user = userEvent.setup();
    render(
      <AppShell databaseName={crypto.randomUUID()}>
        <p>Watchlist content</p>
      </AppShell>,
    );

    await waitFor(() =>
      expect(screen.getByText("Welcome to FDraft")).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText("Profile name"), "Alex");
    await user.click(screen.getByRole("button", { name: "Create Profile" }));

    await waitFor(() =>
      expect(screen.getByText("Watchlist content")).toBeInTheDocument(),
    );
    // The header's home link always has a real accessible name — at
    // narrow widths its icon is aria-hidden and its text label is hidden
    // via CSS alone, which would otherwise leave it with none at all — see
    // docs/product-spec.md, "COMPLETE PRODUCT AUDIT".
    expect(
      screen.getByRole("link", { name: "FDraft — home" }),
    ).toBeInTheDocument();
    // The header now shows the profile, not an email/sign-out control.
    expect(
      screen.getByRole("button", { name: "Profile menu" }),
    ).toBeInTheDocument();
  });

  it("a second launch with a single existing profile auto-opens it — no picker shown", async () => {
    const databaseName = crypto.randomUUID();
    const user = userEvent.setup();

    const first = render(
      <AppShell databaseName={databaseName}>
        <p>Watchlist content</p>
      </AppShell>,
    );
    await waitFor(() =>
      expect(screen.getByText("Welcome to FDraft")).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText("Profile name"), "Alex");
    await user.click(screen.getByRole("button", { name: "Create Profile" }));
    await waitFor(() =>
      expect(screen.getByText("Watchlist content")).toBeInTheDocument(),
    );
    first.unmount();
    cleanup();

    // Simulates reopening the app later — a brand-new AppShell instance
    // against the SAME underlying local database.
    render(
      <AppShell databaseName={databaseName}>
        <p>Watchlist content</p>
      </AppShell>,
    );
    await waitFor(() =>
      expect(screen.getByText("Watchlist content")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Welcome to FDraft")).not.toBeInTheDocument();
    expect(screen.queryByText("Who's watching?")).not.toBeInTheDocument();
  });

  it("surfaces a real error state (with a working retry) instead of hanging on 'Loading…' forever when the initial IndexedDB read fails — see docs/product-spec.md, 'COMPLETE PRODUCT AUDIT'", async () => {
    const resolveInitialProfile = vi
      .spyOn(ProfileService.prototype, "resolveInitialProfile")
      .mockRejectedValueOnce(new Error("IndexedDB open failed"));
    const user = userEvent.setup();

    render(
      <AppShell databaseName={crypto.randomUUID()}>
        <p>Watchlist content</p>
      </AppShell>,
    );

    await waitFor(() =>
      expect(
        screen.getByText("Couldn't open local storage"),
      ).toBeInTheDocument(),
    );
    // Never gets stuck on the bare "Loading…" state once a real error is known.
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    resolveInitialProfile.mockRestore();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.getByText("Welcome to FDraft")).toBeInTheDocument(),
    );
  });
});
