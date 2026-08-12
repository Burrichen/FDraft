import { z } from "zod";
import { challengeRegistry } from "@/domain/challenges/catalogue";
import { getFilmCount, isFreeform } from "./difficulty";
import { isValidSplit } from "./split";

const IANA_TIMEZONE_PATTERN =
  /^[A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?$|^UTC$/;

export const timezoneSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value === "UTC" || IANA_TIMEZONE_PATTERN.test(value),
    "Must be an IANA timezone name (e.g. Europe/London) or UTC",
  );

const draftDifficultySchema = z.enum([
  "baby",
  "easy",
  "medium",
  "hard",
  "hardcore",
  "freeform",
]);
const draftTimeModeSchema = z.enum(["calendar", "timer"]);
const draftChallengeModeSchema = z.enum(["choose", "decide"]);

/**
 * Validates the input to "create a draft" end to end: the difficulty's film
 * count actually matches the random/challenge split, and a challenge mode
 * (Choose My Challenge vs Decide For Me) is present whenever any challenge
 * slots are requested. Freeform is exempt from the split entirely — it has
 * no fixed film count (see difficulty.ts).
 */
export const draftConfigInputSchema = z
  .object({
    difficulty: draftDifficultySchema,
    timeMode: draftTimeModeSchema,
    randomCount: z.number().int().min(0).optional(),
    challengeCount: z.number().int().min(0).optional(),
    challengeMode: draftChallengeModeSchema.optional(),
    chosenChallengeIds: z.array(z.string().min(1)).optional(),
    /** A user-picked genre for Genre Roulette, when it's among chosenChallengeIds (see "Choose My Challenge"). */
    manualGenre: z.string().min(1).optional(),
  })
  .superRefine((config, ctx) => {
    if (isFreeform(config.difficulty)) {
      return;
    }

    if (
      config.randomCount === undefined ||
      config.challengeCount === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "randomCount and challengeCount are required for non-freeform difficulties",
        path: ["randomCount"],
      });
      return;
    }

    const totalFilms = getFilmCount(config.difficulty);
    const split = {
      randomCount: config.randomCount,
      challengeCount: config.challengeCount,
    };
    if (!isValidSplit(totalFilms, split)) {
      ctx.addIssue({
        code: "custom",
        message: `randomCount + challengeCount must equal ${totalFilms} for ${config.difficulty}`,
        path: ["challengeCount"],
      });
    }

    if (config.challengeCount > 0 && config.challengeMode === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "challengeMode is required when challengeCount > 0",
        path: ["challengeMode"],
      });
    }

    if (config.challengeMode === "choose") {
      if (!config.chosenChallengeIds?.length) {
        ctx.addIssue({
          code: "custom",
          message:
            "chosenChallengeIds is required when challengeMode is 'choose'",
          path: ["chosenChallengeIds"],
        });
      } else if (config.chosenChallengeIds.length !== config.challengeCount) {
        ctx.addIssue({
          code: "custom",
          message: `chosenChallengeIds must have exactly ${config.challengeCount} entries (one per challenge slot)`,
          path: ["chosenChallengeIds"],
        });
      } else {
        // "Choose My Challenge" only ever offers non-interactive challenges
        // (see `list-local-challenge-availability.ts` — Battle Royale/Three
        // Doors resolution isn't ported to the local engine yet), and
        // "Decide For Me" already never auto-picks one either. Enforced
        // again here, not just in that UI-layer filter, so a tampered
        // request naming an interactive challenge id directly can't reach
        // `attemptChosenChallenges` and fill a slot that can never finish
        // — see docs/product-spec.md, "COMPLETE PRODUCT AUDIT".
        config.chosenChallengeIds.forEach((id, index) => {
          if (challengeRegistry.getById(id)?.interactive) {
            ctx.addIssue({
              code: "custom",
              message: `chosenChallengeIds[${index}] ("${id}") is an interactive challenge, which "Choose My Challenge" cannot offer yet`,
              path: ["chosenChallengeIds", index],
            });
          }
        });
      }
    }
  });

export type DraftConfigInput = z.infer<typeof draftConfigInputSchema>;
