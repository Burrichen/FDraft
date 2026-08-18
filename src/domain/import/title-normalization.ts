/**
 * Title comparison for metadata matching (see docs/product-spec.md, "DATA
 * PROVIDER RULE" and the metadata-matching bugfix pass this module was
 * added for). A Letterboxd-exported title and a metadata provider's title
 * for the exact same film routinely differ in punctuation, diacritics, and
 * casing without being different films — "Spider-Man: Into the
 * Spider-Verse" vs "Spider Man Into the Spider Verse" must compare equal;
 * "The Thing" (1982) vs "The Thing from Another World" (1951) must not.
 *
 * Original titles are never modified anywhere else in the app — this
 * module exists purely for comparison/search, never for storage or
 * display.
 */

const COMBINING_DIACRITICAL_MARKS = /[\u0300-\u036f]/g;

/** Lowercases, strips diacritics, spells out `&` as "and", and collapses everything else down to letters/digits/spaces. Comparison-only — never used for storage or display. */
export function normalizeFilmTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICAL_MARKS, "") // combining marks NFKD split accented letters into, e.g. "é" -> "e" + U+0301
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const LEADING_ARTICLES = /^(the|a|an) /;

/** A looser comparison key than `normalizeFilmTitle` alone — drops a single leading article ("The Matrix" -> "matrix"), for the lowest-confidence title-only tier of matching. Not used for the stronger tiers, since dropping an article can occasionally change which film is meant. */
export function stripLeadingArticle(normalized: string): string {
  return normalized.replace(LEADING_ARTICLES, "");
}

function tokenize(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/**
 * Dice coefficient over normalized-title word tokens — `1` for titles that
 * are identical once normalized, `0` for titles sharing no words at all,
 * and a graduated score in between. Chosen over edit-distance because
 * word-order-preserving punctuation differences (the Spider-Verse example
 * above) and subtitle differences ("Blade Runner" vs "Blade Runner 2049")
 * both need to produce sensible, explainable partial scores, not a single
 * character-level distance number.
 */
export function titleSimilarity(a: string, b: string): number {
  const normA = normalizeFilmTitle(a);
  const normB = normalizeFilmTitle(b);
  if (normA === normB) {
    return 1;
  }

  const tokensA = new Set(tokenize(normA));
  const tokensB = new Set(tokenize(normB));
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  return (2 * intersection) / (tokensA.size + tokensB.size);
}

const ARTICLE_TOKENS = new Set(["the", "a", "an"]);

/** True when every token of `smaller` appears in `larger`, `larger` has at least one extra token, and at least one of those extra tokens is NOT simply a leading article. */
function isSuspiciousSuperset(
  smaller: ReadonlySet<string>,
  larger: ReadonlySet<string>,
): boolean {
  if (smaller.size === 0 || smaller.size >= larger.size) {
    return false;
  }
  for (const token of smaller) {
    if (!larger.has(token)) return false;
  }
  const extraTokens = [...larger].filter((token) => !smaller.has(token));
  return !extraTokens.every((token) => ARTICLE_TOKENS.has(token));
}

/**
 * True when one title's word-token set is a STRICT subset of the
 * other's, and the extra tokens the longer title carries are not simply
 * a leading article — see docs/updates, v1.1.0, "DRAFT CANDIDATE
 * INTEGRITY", "METADATA ENTITY MISMATCHES". This is exactly the shape of
 * "Creating The Queen's Gambit" containing every one of "The Queen's
 * Gambit"'s own words plus more: a documentary/making-of/behind-the-
 * scenes companion piece, not the same work, and a high Dice-coefficient
 * `titleSimilarity` score alone can't tell the two apart. Deliberately
 * NOT flagged: "Matrix" as a subset of "The Matrix" (the only extra token
 * is the article "the") — an ordinary leading-article difference the
 * matcher must keep accepting.
 */
export function hasSuspiciousTitleContainment(a: string, b: string): boolean {
  const tokensA = new Set(tokenize(normalizeFilmTitle(a)));
  const tokensB = new Set(tokenize(normalizeFilmTitle(b)));
  return (
    isSuspiciousSuperset(tokensA, tokensB) ||
    isSuspiciousSuperset(tokensB, tokensA)
  );
}
