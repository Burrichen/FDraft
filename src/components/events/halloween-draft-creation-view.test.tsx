import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { HalloweenDraftCreationView } from "./halloween-draft-creation-view";

const PROFILE_ID = "alex";

function Harness({
  databaseName,
  gameplayEnabled = true,
}: {
  databaseName: string;
  gameplayEnabled?: boolean;
}) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <HalloweenDraftCreationView
        onCreated={() => {}}
        gameplayEnabled={gameplayEnabled}
      />
    </ProfileProvider>
  );
}

async function seedProfile(databaseName: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    timezone: "UTC",
    settings: {
      reducedMotion: false,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
      adminMode: false,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await db.close();
}

describe("HalloweenDraftCreationView — availability gate (PROMPT 21)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the creation form during Halloween's natural window", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);
    expect(
      (await screen.findAllByText("Create Halloween Draft"))[0],
    ).toBeInTheDocument();
  });

  it("shows a 'wrapped up' message instead of the form once the window has closed", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T00:00:00.000Z"));

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(/wrapped up for this year/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Create Halloween Draft"),
    ).not.toBeInTheDocument();
  });

  it("resumes offering the form immediately when Admin Mode's simulated date is inside the window, even though the real date is outside it", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    // Real "now" is outside the window...
    vi.setSystemTime(new Date("2026-11-01T00:00:00.000Z"));

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const profile = await repos.profiles.getById(PROFILE_ID);
    await repos.profiles.update({
      ...profile!,
      settings: { ...profile!.settings, adminMode: true },
    });
    await setEventDateOverride(repos, PROFILE_ID, {
      enabled: true,
      eventId: "halloween",
      simulatedDate: "2026-10-15T12:00:00.000Z",
    });
    await db.close();

    render(<Harness databaseName={databaseName} />);
    expect(
      (await screen.findAllByText("Create Halloween Draft"))[0],
    ).toBeInTheDocument();
  });
});

describe("HalloweenDraftCreationView — fixed Event deadline, no Calendar/Timer selector (PROMPT B2.2, copy revised by HALLOWEEN PAGE REBUILD §6)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the real Event deadline (as '31 October at midnight', not the raw '1 November 00:00' instant) and never offers a Calendar/Timer mode choice", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await user.click((await screen.findAllByText("Create Halloween Draft"))[0]);
    await waitFor(() =>
      expect(screen.getByText("Event Deadline")).toBeInTheDocument(),
    );
    expect(screen.getByText("Ends 31 October at midnight")).toBeInTheDocument();
    expect(screen.queryByText(/1 november/i)).not.toBeInTheDocument();

    // No trace of the removed mode selector anywhere on the page.
    expect(screen.queryByText(/^Calendar$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Timer$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /calendar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^timer$/i })).toBeNull();
  });

  it("shows the SAME deadline (31 October at midnight) regardless of where in the window 'now' falls", async () => {
    for (const now of [
      "2026-09-30T19:15:00.000Z",
      "2026-10-15T00:00:00.000Z",
      "2026-10-31T23:00:00.000Z",
    ]) {
      const databaseName = crypto.randomUUID();
      await seedProfile(databaseName);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(now));
      const user = userEvent.setup();

      const { unmount } = render(<Harness databaseName={databaseName} />);
      await user.click(
        (await screen.findAllByText("Create Halloween Draft"))[0],
      );
      await waitFor(() =>
        expect(screen.getByText("Event Deadline")).toBeInTheDocument(),
      );
      expect(
        screen.getByText("Ends 31 October at midnight"),
      ).toBeInTheDocument();
      unmount();
      vi.useRealTimers();
    }
  });
});

describe("HalloweenDraftCreationView — Event-window time progress (HALLOWEEN PAGE REBUILD §7)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows progress through the WHOLE event window before any Draft exists, roughly midway around 15 October", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T19:30:00.000Z"));

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(/% elapsed/)).toBeInTheDocument(),
    );
    const elapsedText = screen.getByText(/% elapsed/).textContent ?? "";
    const percent = Number(elapsedText.match(/(\d+)% elapsed/)?.[1]);
    expect(percent).toBeGreaterThan(40);
    expect(percent).toBeLessThan(60);
  });

  it("shows the collapsed 'No Halloween Draft yet' step first, revealing the difficulty/pool controls only after Create is clicked", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    const user = userEvent.setup();

    render(<Harness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText("No Halloween Draft yet.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Choose a difficulty")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Create Halloween Draft" }),
    );

    expect(screen.getByText("Choose a difficulty")).toBeInTheDocument();
  });
});

describe("HalloweenDraftCreationView — Event Gameplay off (HALLOWEEN PAGE REBUILD §10)", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows a clear explanation instead of the Create button, but still shows event-window progress", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));

    render(<Harness databaseName={databaseName} gameplayEnabled={false} />);
    await waitFor(() =>
      expect(
        screen.getByText(/Event Gameplay is turned off/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Create Halloween Draft" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/% elapsed/)).toBeInTheDocument();
  });
});
