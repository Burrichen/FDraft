import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChallengeBrowser,
  type ChallengeAvailability,
} from "./challenge-browser";

afterEach(cleanup);

const CHALLENGES: ChallengeAvailability[] = [
  {
    id: "the-number-7",
    name: "The Number 7",
    description:
      "Shuffles your eligible watchlist and takes the seventh result.",
    category: "meta",
    interactive: false,
    eligible: true,
    ineligibleReason: null,
  },
];

function renderBrowser(
  overrides: Partial<Parameters<typeof ChallengeBrowser>[0]> = {},
) {
  return render(
    <ChallengeBrowser
      challenges={CHALLENGES}
      availableGenres={[]}
      slotsNeeded={2}
      selectedChallengeIds={[]}
      onChange={vi.fn()}
      manualGenre=""
      onManualGenreChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("ChallengeBrowser — Pick Your Own removed", () => {
  it("does not list 'Pick Your Own' among the browsable challenges", async () => {
    const user = userEvent.setup();
    renderBrowser();
    expect(screen.queryByText("Pick Your Own")).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: "Search challenges" }),
      "pick your own",
    );
    expect(screen.getByText("No matching challenges.")).toBeInTheDocument();
  });
});

describe("ChallengeBrowser — variant='single' (One At A Time)", () => {
  it("never shows the multi-slot 'X of Y chosen' summary or Empty slot placeholders", () => {
    renderBrowser({ variant: "single", slotsNeeded: 1 });
    expect(screen.queryByText(/chosen$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Empty slot")).not.toBeInTheDocument();
  });

  it("still shows the chosen challenge as a removable chip once one is picked", () => {
    renderBrowser({
      variant: "single",
      slotsNeeded: 1,
      selectedChallengeIds: ["the-number-7"],
    });
    expect(screen.queryByText(/chosen$/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove The Number 7" }),
    ).toBeInTheDocument();
  });

  it("the default 'multi' variant is unchanged — still shows the summary and empty slots", () => {
    renderBrowser({ slotsNeeded: 2 });
    expect(screen.getByText("0 of 2 challenges chosen")).toBeInTheDocument();
    expect(screen.getAllByText("Empty slot")).toHaveLength(2);
  });
});
