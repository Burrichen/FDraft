import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { setEventDateOverride } from "@/application/events/event-date-override-store";
import { setEventParticipation } from "@/application/events/event-participation-store";
import { isEventEndingAcknowledged } from "@/application/events/event-ending-acknowledgement-store";
import { isEventEndingStingerAcknowledged } from "@/application/events/event-ending-stinger-store";
import { getEventParticipations } from "@/application/events/event-participation-store";
import { getEventSettings } from "@/application/events/event-settings-store";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { WatchUndoProvider } from "@/components/watch-undo/watch-undo-provider";
import {
  CHRISTMAS_EVENT_ID,
  getEventDefinition,
} from "@/domain/events/event-registry";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { EVENT_VISUAL_THEMES } from "./event-visual-themes";
import { EventEndingDialog } from "./event-ending-dialog";
import { EventIntroDialog } from "./event-intro-dialog";

const PROFILE_ID = "alex";
const CHRISTMAS = getEventDefinition(CHRISTMAS_EVENT_ID)!;
const APPROVED_DESCRIPTION = CHRISTMAS.intro.description;
const APPROVED_BULLETS = CHRISTMAS.intro.bullets;
const ENDING_MESSAGE = CHRISTMAS.ending!.message;
const STINGER_MESSAGE = CHRISTMAS.ending!.stinger!.message;

function IntroHarness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <WatchUndoProvider>
          <EventIntroDialog />
        </WatchUndoProvider>
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}

function EndingHarness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <WatchUndoProvider>
          <EventEndingDialog />
          <p>Page content</p>
        </WatchUndoProvider>
      </EventDiscoveryProvider>
    </ProfileProvider>
  );
}

async function seedProfile(databaseName: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await repos.profiles.create({
    id: PROFILE_ID,
    displayName: "Alex",
    createdAt: "2027-01-01T00:00:00.000Z",
    lastOpenedAt: "2027-01-01T00:00:00.000Z",
    timezone: "UTC",
    settings: {
      reducedMotion: false,
      defaultPage: "watchlist",
      franchiseChronologicalOrder: false,
      adminMode: true,
      halloweenPumpkinState: "uncarved",
    },
    dataVersion: 1,
  });
  await db.close();
}

async function setChristmasSimulatedDate(
  databaseName: string,
  simulatedDate: string,
) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await setEventDateOverride(repos, PROFILE_ID, {
    enabled: true,
    eventId: CHRISTMAS_EVENT_ID,
    simulatedDate,
  });
  await db.close();
}

async function joinOccurrence(databaseName: string, occurrenceKey: string) {
  const db = new FDraftLocalDatabase(databaseName);
  const repos = createLocalRepositories(db);
  await setEventParticipation(repos, PROFILE_ID, occurrenceKey, "joined");
  await db.close();
}

/**
 * Covers docs/updates, "FDRAFT UPDATE 1 — CHRISTMAS DRAFT DIFFICULTIES +
 * VISUAL POLISH" §12-§16's test list: the intro modal's polished layout
 * with its approved copy intact, the first ending modal, the deliberately
 * un-themed "Onto next year!" button, and the second (January stinger)
 * stage still working with its own persisted acknowledgement.
 */
describe("Christmas intro modal", () => {
  afterEach(cleanup);

  it("opens on 'Ho Ho Ho' with the year's Holiday Celebration subtitle", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await setChristmasSimulatedDate(databaseName, "2027-12-10T12:00:00.000Z");

    render(<IntroHarness databaseName={databaseName} />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Ho Ho Ho/ }),
      ).toBeInTheDocument(),
    );
    // §12 — the year plus "FDraft Holiday Celebration", read from the
    // occurrence itself rather than the wall clock.
    expect(screen.getByText(/FDraft Holiday Celebration/)).toBeInTheDocument();
    expect(screen.getByText("2027")).toBeInTheDocument();
    // The event's own name is no longer the visible title.
    expect(
      screen.queryByRole("heading", { name: "Christmas" }),
    ).not.toBeInTheDocument();
  });

  it("keeps every word of the approved description and bullets exactly, not a reworded version", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await setChristmasSimulatedDate(databaseName, "2027-12-10T12:00:00.000Z");

    render(<IntroHarness databaseName={databaseName} />);

    // §12 — "Keep its existing approved text EXACTLY. Do not rewrite the
    // copy." Asserted against the registry's own strings, so this test
    // can never pass against a hand-copied duplicate that drifted.
    expect(await screen.findByText(APPROVED_DESCRIPTION)).toBeInTheDocument();
    for (const bullet of APPROVED_BULLETS) {
      expect(screen.getByText(bullet)).toBeInTheDocument();
    }
    expect(APPROVED_BULLETS.length).toBeGreaterThan(0);
  });

  it("still offers both join actions, and applies the scoped Christmas theme rather than Halloween's", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await setChristmasSimulatedDate(databaseName, "2027-12-10T12:00:00.000Z");

    render(<IntroHarness databaseName={databaseName} />);

    const dialog = await screen.findByRole("alertdialog");
    expect(screen.getByRole("button", { name: "Opt In" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nah" })).toBeInTheDocument();
    expect(dialog.className).toContain("theme-christmas");
    expect(dialog.className).not.toContain("theme-halloween");
  });

  it("styles through Christmas theme tokens, never raw hex or oklch values", () => {
    // §11/§13 — no scattered colour literals, and no rainbow text.
    const theme = EVENT_VISUAL_THEMES[CHRISTMAS_EVENT_ID];
    for (const className of [
      theme?.rootClassName,
      theme?.titleClassName,
      theme?.endingRootClassName,
      theme?.endingTitleClassName,
    ]) {
      expect(className).toBeTruthy();
      expect(className).not.toMatch(/#[0-9a-f]{3,8}|oklch\(|rgb\(/i);
    }
    expect(theme?.titleClassName).toMatch(/text-christmas-/);
  });
});

describe("Christmas ending — first stage", () => {
  afterEach(cleanup);

  it("shows 'Have a lovely year!' with the approved body and its Burrichen sign-off", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, `${CHRISTMAS_EVENT_ID}:2027`);
    await setChristmasSimulatedDate(databaseName, "2028-01-01T00:00:01.000Z");

    render(<EndingHarness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText(ENDING_MESSAGE)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: /Have a lovely year!/ }),
    ).toBeInTheDocument();
    // §14 — the exact supplied sign-off survives verbatim.
    expect(ENDING_MESSAGE).toContain("From, Burrichen");
  });

  it("'Onto next year!' is a centred, standard FDraft button — never recoloured red/green/blue", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, `${CHRISTMAS_EVENT_ID}:2027`);
    await setChristmasSimulatedDate(databaseName, "2028-01-01T00:00:01.000Z");

    render(<EndingHarness databaseName={databaseName} />);

    const button = await screen.findByRole("button", {
      name: "Onto next year!",
    });
    // §15 — full-width (so it reads centred) and carrying no Christmas
    // colour class of its own.
    expect(button.className).toContain("w-full");
    expect(button.className).not.toMatch(/christmas/);

    // And critically: the ending dialog does NOT apply the
    // `.theme-christmas` token reroute, which is what would otherwise
    // repaint this shared `Button` festive via `--primary`.
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.className).not.toContain("theme-christmas");
    expect(dialog.className).toContain("bg-christmas-surface");
  });
});

describe("Christmas ending — second stage (the January stinger)", () => {
  afterEach(cleanup);

  it("appears after the first stage is acknowledged, with its exact copy, then persists its own acknowledgement", async () => {
    const user = userEvent.setup();
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, `${CHRISTMAS_EVENT_ID}:2027`);
    await setChristmasSimulatedDate(databaseName, "2028-01-01T00:00:01.000Z");

    render(<EndingHarness databaseName={databaseName} />);

    // Stage one.
    await user.click(
      await screen.findByRole("button", { name: "Onto next year!" }),
    );

    // Stage two — after its own delay.
    await waitFor(
      () => expect(screen.getByText(STINGER_MESSAGE)).toBeInTheDocument(),
      { timeout: 6000 },
    );
    expect(STINGER_MESSAGE).toBe("Fuck you, it's January!");

    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    // Stage one is recorded; stage two is not yet.
    expect(
      await isEventEndingAcknowledged(
        repos,
        PROFILE_ID,
        `${CHRISTMAS_EVENT_ID}:2027`,
      ),
    ).toBe(true);
    expect(
      await isEventEndingStingerAcknowledged(
        repos,
        PROFILE_ID,
        `${CHRISTMAS_EVENT_ID}:2027`,
      ),
    ).toBe(false);
    await db.close();

    await user.click(
      screen.getByRole("button", {
        name: CHRISTMAS.ending!.stinger!.buttonLabel,
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText(STINGER_MESSAGE)).not.toBeInTheDocument(),
    );

    const db2 = new FDraftLocalDatabase(databaseName);
    const repos2 = createLocalRepositories(db2);
    expect(
      await isEventEndingStingerAcknowledged(
        repos2,
        PROFILE_ID,
        `${CHRISTMAS_EVENT_ID}:2027`,
      ),
    ).toBe(true);
    await db2.close();
  }, 15000);

  it("shows immediately on a fresh launch when stage one was already acknowledged in an earlier session", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, `${CHRISTMAS_EVENT_ID}:2027`);
    await setChristmasSimulatedDate(databaseName, "2028-01-01T00:00:01.000Z");
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.settings.set(PROFILE_ID, "events.endingAcknowledgements", {
      [`${CHRISTMAS_EVENT_ID}:2027`]: true,
    });
    await db.close();

    render(<EndingHarness databaseName={databaseName} />);

    // No stage-one modal (already dismissed), and no delay to wait out —
    // the beat has long since passed in real time.
    await waitFor(() =>
      expect(screen.getByText(STINGER_MESSAGE)).toBeInTheDocument(),
    );
    expect(screen.queryByText(ENDING_MESSAGE)).not.toBeInTheDocument();
  });

  it("never shows again once acknowledged", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, `${CHRISTMAS_EVENT_ID}:2027`);
    await setChristmasSimulatedDate(databaseName, "2028-01-01T00:00:01.000Z");
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    await repos.settings.set(PROFILE_ID, "events.endingAcknowledgements", {
      [`${CHRISTMAS_EVENT_ID}:2027`]: true,
    });
    await repos.settings.set(
      PROFILE_ID,
      "events.endingStingerAcknowledgements",
      { [`${CHRISTMAS_EVENT_ID}:2027`]: true },
    );
    await db.close();

    render(<EndingHarness databaseName={databaseName} />);

    await waitFor(() =>
      expect(screen.getByText("Page content")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does NOT activate January early, or touch any participation state", async () => {
    const user = userEvent.setup();
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);
    await joinOccurrence(databaseName, `${CHRISTMAS_EVENT_ID}:2027`);
    await setChristmasSimulatedDate(databaseName, "2028-01-01T00:00:01.000Z");

    render(<EndingHarness databaseName={databaseName} />);
    await user.click(
      await screen.findByRole("button", { name: "Onto next year!" }),
    );
    await waitFor(
      () => expect(screen.getByText(STINGER_MESSAGE)).toBeInTheDocument(),
      { timeout: 6000 },
    );
    await user.click(
      screen.getByRole("button", {
        name: CHRISTMAS.ending!.stinger!.buttonLabel,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText(STINGER_MESSAGE)).not.toBeInTheDocument(),
    );

    // §16 — the stinger is copy plus its own acknowledgement, nothing
    // more. January must be untouched: no participation record of any
    // kind, and nothing added to `manuallyEnabledEvents`.
    const db = new FDraftLocalDatabase(databaseName);
    const repos = createLocalRepositories(db);
    const participations = await getEventParticipations(repos, PROFILE_ID);
    expect(
      Object.keys(participations).filter((key) =>
        key.startsWith("f-you-its-january"),
      ),
    ).toEqual([]);
    const settings = await getEventSettings(repos, PROFILE_ID);
    expect(settings.manuallyEnabledEvents).not.toContain("f-you-its-january");
    expect(settings.activeEvent).not.toBe("f-you-its-january");
    await db.close();
  }, 15000);
});
