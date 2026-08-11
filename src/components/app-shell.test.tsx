import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "@/components/app-shell";

/**
 * Proves the core claims of "REMOVE AUTHENTICATION" (see
 * docs/product-spec.md, Prompt 9.5B): opening the app renders real content
 * immediately — no login redirect, no session/auth object anywhere in the
 * render path — and shows the first-run screen (not a login form) when no
 * local profile exists yet.
 */
describe("AppShell (real fake-indexeddb, no auth/session anywhere)", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
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
});
