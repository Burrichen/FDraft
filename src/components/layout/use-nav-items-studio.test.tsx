import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventDiscoveryProvider } from "@/components/events/event-discovery-provider";
import { ProfileProvider } from "@/components/profiles/profile-provider";
import { createLocalRepositories } from "@/infrastructure/local-db/create-local-repositories";
import { FDraftLocalDatabase } from "@/infrastructure/local-db/database";
import { useNavItems } from "./use-nav-items";

/**
 * Covers docs/updates, "EVENT STUDIO — PHASE 2" §6/§11 — the OTHER half
 * of `nav-links.test.tsx`'s "Event Studio nav item is absent from normal
 * FDraft" test: with `isEventStudioBuild` true (as it only ever is inside
 * the separate FDraft (Dev) build), the SAME hook must add exactly one
 * more nav item, clearly labelled, pointing at `/studio` — and every
 * other item must be completely unaffected. Mocked via `vi.mock` (hoisted
 * above every import by Vitest's own transform, so the static imports
 * above resolve against the mocked module) in THIS file only, so
 * `nav-links.test.tsx` itself keeps exercising the real, default
 * (`false`) value untouched.
 */
vi.mock("@/lib/event-studio-build", () => ({ isEventStudioBuild: true }));

const PROFILE_ID = "alex";

function NavItemsProbe() {
  const items = useNavItems();
  return (
    <ul>
      {items.map((item) => (
        <li key={item.href}>
          {item.href} | {item.label}
        </li>
      ))}
    </ul>
  );
}

function ProbeHarness({ databaseName }: { databaseName: string }) {
  return (
    <ProfileProvider databaseName={databaseName}>
      <EventDiscoveryProvider>
        <NavItemsProbe />
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

describe("useNavItems — Event Studio nav item present in FDraft (Dev)", () => {
  afterEach(() => {
    cleanup();
  });

  it("adds a clearly-labelled Event Studio nav item pointing at /studio, alongside every normal item", async () => {
    const databaseName = crypto.randomUUID();
    await seedProfile(databaseName);

    render(<ProbeHarness databaseName={databaseName} />);
    await waitFor(() =>
      expect(screen.getByText(/\/watchlist/)).toBeInTheDocument(),
    );

    expect(screen.getByText(/\/studio \| Event Studio/)).toBeInTheDocument();
    // Every ordinary item is still present, unaffected.
    expect(screen.getByText(/\/watchlist/)).toBeInTheDocument();
    expect(screen.getByText(/\/drafts \|/)).toBeInTheDocument();
    expect(screen.getByText(/\/stats/)).toBeInTheDocument();
  });
});
