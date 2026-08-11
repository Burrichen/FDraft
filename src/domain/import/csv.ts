import Papa from "papaparse";

/**
 * Thin, safe wrapper around Papa Parse. Every Letterboxd export CSV shares
 * the same shape (a header row, then data rows), so this is the one place
 * that decides how a malformed file is reported rather than each row parser
 * reinventing it.
 */
export interface ParsedCsv {
  headers: string[];
  /** Data rows keyed by header name, in file order. */
  rows: Record<string, string>[];
}

export interface CsvParseFailure {
  type: "parse_error";
  message: string;
}

export type CsvParseOutcome =
  { ok: true; csv: ParsedCsv } | { ok: false; failure: CsvParseFailure };

/**
 * Parses raw CSV text safely: never throws, and treats an empty/unparsable
 * file as a reportable failure rather than an unresolvable exception (see
 * docs/product-spec.md edge cases: "malformed CSV").
 */
export function parseCsv(content: string): CsvParseOutcome {
  if (content.trim().length === 0) {
    return {
      ok: false,
      failure: { type: "parse_error", message: "The file is empty." },
    };
  }

  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  // Papa Parse reports row-level errors (e.g. a row with too many fields)
  // but still returns whatever it could recover — only treat it as fatal
  // when nothing usable came back at all.
  if (result.data.length === 0 && result.errors.length > 0) {
    return {
      ok: false,
      failure: {
        type: "parse_error",
        message: result.errors[0]?.message ?? "Could not parse CSV.",
      },
    };
  }

  const headers = result.meta.fields ?? [];
  if (headers.length === 0) {
    return {
      ok: false,
      failure: { type: "parse_error", message: "No header row found." },
    };
  }

  return { ok: true, csv: { headers, rows: result.data } };
}

/** Returns the subset of `required` headers that are missing from `headers`, preserving `required`'s order. */
export function findMissingHeaders(
  headers: string[],
  required: readonly string[],
): string[] {
  const present = new Set(headers.map((h) => h.trim()));
  return required.filter((header) => !present.has(header));
}
