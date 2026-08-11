import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ProfilePicker } from "./profile-picker";
import { ProfileProvider, useProfileContext } from "./profile-provider";

function ActiveProfileLabel() {
  const { activeProfile } = useProfileContext();
  if (activeProfile === undefined) return <p>Loading…</p>;
  if (activeProfile === null) return <p>No active profile</p>;
  return <p>Active: {activeProfile.displayName}</p>;
}

function Harness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <ActiveProfileLabel />
      <ProfilePicker />
    </ProfileProvider>
  );
}

describe("ProfilePicker + ProfileProvider (real fake-indexeddb, no auth/session anywhere)", () => {
  afterEach(() => {
    // This project doesn't enable Vitest's `globals`, so
    // @testing-library/react's automatic afterEach(cleanup) never
    // registers — without this, each test's rendered tree (and its live
    // ProfileProvider/IndexedDB connection) leaks into the next.
    cleanup();
    window.localStorage.clear();
  });

  it("first launch: shows the picker with no existing profiles, and creating one activates it", async () => {
    const user = userEvent.setup();
    render(<Harness databaseName={crypto.randomUUID()} />);

    await waitFor(() =>
      expect(screen.getByText("No active profile")).toBeInTheDocument(),
    );
    expect(screen.getByText("Who's watching?")).toBeInTheDocument();

    await user.type(screen.getByLabelText("New profile name"), "Alex");
    await user.click(screen.getByRole("button", { name: "+ Create Profile" }));

    await waitFor(() =>
      expect(screen.getByText("Active: Alex")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Alex/ })).toBeInTheDocument();
  });

  it("switching between two existing profiles updates the active profile", async () => {
    const user = userEvent.setup();
    render(<Harness databaseName={crypto.randomUUID()} />);
    await waitFor(() =>
      expect(screen.getByText("No active profile")).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText("New profile name"), "Alex");
    await user.click(screen.getByRole("button", { name: "+ Create Profile" }));
    await waitFor(() =>
      expect(screen.getByText("Active: Alex")).toBeInTheDocument(),
    );

    await user.clear(screen.getByLabelText("New profile name"));
    await user.type(screen.getByLabelText("New profile name"), "Sam");
    await user.click(screen.getByRole("button", { name: "+ Create Profile" }));
    await waitFor(() =>
      expect(screen.getByText("Active: Sam")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /Alex/ }));
    await waitFor(() =>
      expect(screen.getByText("Active: Alex")).toBeInTheDocument(),
    );
  });

  it("never shows a password or email field — a profile is just a name", async () => {
    render(<Harness databaseName={crypto.randomUUID()} />);
    await waitFor(() =>
      expect(screen.getByText("No active profile")).toBeInTheDocument(),
    );

    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });
});
