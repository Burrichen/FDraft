import { pickWeighted, shuffle } from "@/domain/shared/rng";
import {
  beginBattleRoyale,
  BATTLE_ROYALE_CANDIDATE_COUNT,
} from "../interactive/battle-royale";
import { beginThreeDoors } from "../interactive/three-doors";
import {
  calculateAntiLotteryTickets,
  calculateLotteryTickets,
} from "../lottery";
import type { ChallengeDefinition } from "../types";
import {
  withKnownRating,
  withKnownReleaseYear,
  withKnownRuntime,
} from "./shared";

/**
 * Meta/random/interactive challenges (see docs/product-spec.md, "META /
 * RANDOM / INTERACTIVE"). The two Battle Royale variants and Three Doors
 * are `interactive: true`: their `attempt()` never returns `success`
 * directly — it returns `requires_user_choice` with the initial state
 * machine snapshot as `payload` (see `../interactive/battle-royale.ts` and
 * `../interactive/three-doors.ts` for the pure state transitions, and
 * `src/lib/challenges/interactive-state.ts` for how that snapshot is
 * persisted so the flow survives a page reload).
 */

const NUMBER_7_ORDINAL_INDEX = 6;

const theNumberSeven: ChallengeDefinition = {
  id: "the-number-7",
  name: "The Number 7",
  description: "Shuffles your eligible watchlist and takes the seventh result.",
  category: "meta",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => context.candidates.length >= 7,
  attempt: (context) => {
    if (context.candidates.length < 7) {
      return {
        status: "ineligible",
        reason: "fewer_than_seven_eligible_films",
      };
    }
    // No authorized provider currently exposes a genuine Letterboxd-style
    // "Shuffle" ordering (see docs/product-spec.md) — this always uses the
    // app's own Fisher-Yates `shuffle` utility, seeded per the injected
    // `rng`, not a real Letterboxd shuffle.
    const shuffled = shuffle(context.candidates, context.rng);
    return { status: "success", film: shuffled[NUMBER_7_ORDINAL_INDEX] };
  },
};

const battleRoyale: ChallengeDefinition = {
  id: "battle-royale",
  name: "Battle Royale",
  description:
    "Eight films enter. Pick your most anticipated, then your least. The most anticipated joins the draft.",
  category: "meta",
  requiredCapabilities: [],
  interactive: true,
  isEligible: (context) =>
    context.candidates.length >= BATTLE_ROYALE_CANDIDATE_COUNT,
  attempt: (context) => {
    const state = beginBattleRoyale(
      context.candidates,
      "standard",
      context.rng,
    );
    if (!state) {
      return {
        status: "ineligible",
        reason: "fewer_than_eight_eligible_films",
      };
    }
    return {
      status: "requires_user_choice",
      interactionId: "battle-royale",
      payload: state,
    };
  },
};

/**
 * The underdog variant (see docs/product-spec.md, "Battle Royale
 * Variant"): identical flow, opposite winner. The user-facing `name` must
 * read exactly "Battle Royale" — never "Fake" anything — with the internal
 * `id` (`battle-royale-underdog`) carrying the distinction instead.
 */
const battleRoyaleUnderdog: ChallengeDefinition = {
  id: "battle-royale-underdog",
  name: "Battle Royale",
  description:
    "Eight films enter. Pick your most anticipated, then your least. This time, it's the one you dreaded that joins the draft.",
  category: "meta",
  requiredCapabilities: [],
  interactive: true,
  isEligible: (context) =>
    context.candidates.length >= BATTLE_ROYALE_CANDIDATE_COUNT,
  attempt: (context) => {
    const state = beginBattleRoyale(
      context.candidates,
      "underdog",
      context.rng,
    );
    if (!state) {
      return {
        status: "ineligible",
        reason: "fewer_than_eight_eligible_films",
      };
    }
    return {
      status: "requires_user_choice",
      interactionId: "battle-royale-underdog",
      payload: state,
    };
  },
};

const threeDoors: ChallengeDefinition = {
  id: "three-doors",
  name: "Three Doors",
  description:
    "Behind one door: a short film. Behind another: an old one. Behind the third: a highly rated one. Choose.",
  category: "meta",
  requiredCapabilities: ["runtime", "average_rating"],
  interactive: true,
  // Cheap, rng-free necessary (not sufficient) check — beginThreeDoors itself
  // consumes rng to resolve each door, which isEligible must never do.
  isEligible: (context) =>
    context.candidates.length >= 3 &&
    withKnownRuntime(context.candidates).length > 0 &&
    withKnownReleaseYear(context.candidates).length > 0 &&
    withKnownRating(context.candidates).some(
      (film) => film.averageRating >= 4.0,
    ),
  attempt: (context) => {
    const result = beginThreeDoors(context.candidates, context.rng);
    if (!result.ok) {
      return { status: "ineligible", reason: result.reason };
    }
    return {
      status: "requires_user_choice",
      interactionId: "three-doors",
      payload: result.state,
    };
  },
};

const theDraftLottery: ChallengeDefinition = {
  id: "the-draft-lottery",
  name: "The Draft Lottery",
  description:
    "A weighted random draw — longstanding, underwatched, and underrepresented films earn extra tickets.",
  category: "meta",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => context.candidates.length > 0,
  attempt: (context) => {
    if (context.candidates.length === 0) {
      return { status: "ineligible", reason: "no_active_watchlist_films" };
    }
    const tickets = calculateLotteryTickets(context.candidates, context.now);
    const winningTicket = pickWeighted(
      tickets.map((ticket) => ({ ticket, weight: ticket.totalTickets })),
      context.rng,
    ).ticket;
    const film = context.candidates.find(
      (f) => f.watchlistEntryId === winningTicket.watchlistEntryId,
    );
    if (!film) {
      return {
        status: "failure",
        reason: "lottery_winner_not_found_in_candidates",
      };
    }
    return { status: "success", film, displayValue: { tickets } };
  },
};

const theAntiDraftLottery: ChallengeDefinition = {
  id: "the-anti-draft-lottery",
  name: "The Anti-Draft Lottery",
  description:
    "The same weighted draw, but recently added and on-taste films earn fewer tickets.",
  category: "meta",
  requiredCapabilities: [],
  interactive: false,
  isEligible: (context) => context.candidates.length > 0,
  attempt: (context) => {
    if (context.candidates.length === 0) {
      return { status: "ineligible", reason: "no_active_watchlist_films" };
    }
    const tickets = calculateAntiLotteryTickets(
      context.candidates,
      context.now,
      context.watchedFilms,
      context.config,
    );
    const winningTicket = pickWeighted(
      tickets.map((ticket) => ({ ticket, weight: ticket.totalTickets })),
      context.rng,
    ).ticket;
    const film = context.candidates.find(
      (f) => f.watchlistEntryId === winningTicket.watchlistEntryId,
    );
    if (!film) {
      return {
        status: "failure",
        reason: "lottery_winner_not_found_in_candidates",
      };
    }
    return { status: "success", film, displayValue: { tickets } };
  },
};

export const metaChallenges: ChallengeDefinition[] = [
  theNumberSeven,
  battleRoyale,
  battleRoyaleUnderdog,
  threeDoors,
  theDraftLottery,
  theAntiDraftLottery,
];
