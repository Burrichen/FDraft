import { describe, expect, it } from "vitest";
import {
  findCrossCategoryDuplicates,
  findWithinCategoryDuplicates,
} from "./event-film-content-schema";
import {
  CHRISTMAS_FILM_CONTENT,
  getEventFilmContent,
  HALLOWEEN_FILM_CONTENT,
  JANUARY_FILM_CONTENT,
} from "./event-film-content";
import {
  F_YOU_ITS_JANUARY_EVENT_ID,
  HALLOWEEN_EVENT_ID,
} from "./event-registry";

/**
 * Loading each event's real bundled `films.json` (see docs/updates,
 * "STATIC EVENT FILM CONTENT PACKS") already happens eagerly at module
 * load in `event-film-content.ts` — if any of the three files were
 * malformed, importing this test file at all would already throw. These
 * tests exercise the actual shipped content, not a fixture, so a broken
 * `public/events/<id>/films.json` fails CI here rather than surfacing as
 * a confusing runtime issue later.
 */
describe("bundled Event film content loads and validates", () => {
  it("loads Halloween's content with horror/kitsch categories", () => {
    expect(HALLOWEEN_FILM_CONTENT.event).toBe("halloween");
    expect(Array.isArray(HALLOWEEN_FILM_CONTENT.horror)).toBe(true);
    expect(Array.isArray(HALLOWEEN_FILM_CONTENT.kitsch)).toBe(true);
  });

  it("loads January's content with a curated category", () => {
    expect(JANUARY_FILM_CONTENT.event).toBe("f-you-its-january");
    expect(Array.isArray(JANUARY_FILM_CONTENT.curated)).toBe(true);
  });

  it("loads Christmas's content with classic/adjacent categories", () => {
    expect(CHRISTMAS_FILM_CONTENT.event).toBe("christmas");
    expect(Array.isArray(CHRISTMAS_FILM_CONTENT.classic)).toBe(true);
    expect(Array.isArray(CHRISTMAS_FILM_CONTENT.adjacent)).toBe(true);
  });

  it("getEventFilmContent resolves each event id to the matching bundled content", () => {
    expect(getEventFilmContent(HALLOWEEN_EVENT_ID)).toBe(
      HALLOWEEN_FILM_CONTENT,
    );
    expect(getEventFilmContent(F_YOU_ITS_JANUARY_EVENT_ID)).toBe(
      JANUARY_FILM_CONTENT,
    );
    expect(getEventFilmContent("christmas")).toBe(CHRISTMAS_FILM_CONTENT);
  });

  it("Halloween's shipped horror/kitsch lists have no within-category duplicates", () => {
    expect(findWithinCategoryDuplicates(HALLOWEEN_FILM_CONTENT.horror)).toEqual(
      [],
    );
    expect(findWithinCategoryDuplicates(HALLOWEEN_FILM_CONTENT.kitsch)).toEqual(
      [],
    );
  });

  it("Halloween's shipped horror/kitsch lists have no cross-category duplicates", () => {
    expect(
      findCrossCategoryDuplicates({
        horror: HALLOWEEN_FILM_CONTENT.horror,
        kitsch: HALLOWEEN_FILM_CONTENT.kitsch,
      }),
    ).toEqual([]);
  });

  it("January's shipped curated list has no within-category duplicates", () => {
    expect(findWithinCategoryDuplicates(JANUARY_FILM_CONTENT.curated)).toEqual(
      [],
    );
  });

  it("Christmas's shipped classic/adjacent lists have no cross-category duplicates", () => {
    expect(
      findCrossCategoryDuplicates({
        classic: CHRISTMAS_FILM_CONTENT.classic,
        adjacent: CHRISTMAS_FILM_CONTENT.adjacent,
      }),
    ).toEqual([]);
  });
});
