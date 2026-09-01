import { z } from "zod";
import { FDRAFT_THEME_INTERACTION_IDS } from "./theme-interaction-ids";

/**
 * The `.fdraft-theme` FILE FORMAT — a versioned, strongly validated,
 * plain-UTF-8-JSON theme-layout format (see docs/updates, "EVENT STUDIO —
 * PHASE 1"). This is the foundation the (not-yet-built) FDraft (Dev)
 * visual editor will eventually EXPORT and the normal Beta renderer
 * (`EventThemeLayoutRenderer`) READS — the same schema, the same types,
 * imported by both, so "what Dev Preview shows" and "what Beta renders"
 * can never independently drift into two different interpretations of
 * the same file.
 *
 * Deliberately plain JSON (git-diffable, human-inspectable, trivially
 * debuggable) — NEVER a binary format, and NEVER capable of carrying
 * executable code: every reference a placement can make (an asset id, an
 * interaction id) is a plain string resolved against a closed, validated
 * list; nothing here is ever `eval`'d or otherwise executed (see
 * `theme-interaction-ids.ts`'s own doc comment for the interaction half
 * of that guarantee).
 *
 * Layered as EVENT/PRESET (one whole file = one theme, `themeId`) ->
 * PAGE (`layouts[pageId]`) -> PAGE STATE (`.states[stateId]`) ->
 * BREAKPOINT (`.breakpoints[breakpointId]`) -> a list of PLACEMENTS. Page
 * ids and state ids are free-form strings (not a hardcoded enum) so a
 * future page/state never requires a schema change — see
 * `docs/product-spec.md`'s Event Studio phase notes for the current
 * convention each real theme file uses (e.g. `"eventPage"` with states
 * `"empty"`/`"creation"`/`"active"`/`"completed"`).
 */

export const FDRAFT_THEME_CURRENT_SCHEMA_VERSION = 1;

export const FDRAFT_THEME_BREAKPOINT_IDS = [
  "mobile",
  "tablet",
  "desktop",
] as const;
export type FDraftThemeBreakpointId =
  (typeof FDRAFT_THEME_BREAKPOINT_IDS)[number];

/**
 * Breakpoint fallback order when a page/state doesn't define every tier
 * (see §3, "layouts must survive sensible viewport changes") — a theme
 * author only has to describe the tiers that genuinely differ; a missing
 * tier falls back to the next SMALLER one that IS defined (desktop falls
 * back to tablet, then mobile), matching this app's own existing
 * Designed Slot convention of "once visible, stays visible; mobile never
 * loses what a wider screen shows" read in reverse (a wider tier that
 * doesn't override anything just inherits the narrower tier's design).
 */
export const FDRAFT_THEME_BREAKPOINT_FALLBACK: Record<
  FDraftThemeBreakpointId,
  readonly FDraftThemeBreakpointId[]
> = {
  desktop: ["desktop", "tablet", "mobile"],
  tablet: ["tablet", "mobile"],
  mobile: ["mobile"],
};

export const FDRAFT_THEME_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "left-center",
  "center",
  "right-center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type FDraftThemeAnchor = (typeof FDRAFT_THEME_ANCHORS)[number];

export const FDRAFT_THEME_LAYERS = ["background", "mid", "foreground"] as const;
export type FDraftThemeLayer = (typeof FDRAFT_THEME_LAYERS)[number];

export const FDRAFT_THEME_COORDINATE_SPACES = ["page", "viewport"] as const;
export type FDraftThemeCoordinateSpace =
  (typeof FDRAFT_THEME_COORDINATE_SPACES)[number];

/**
 * Every asset a theme references is a validated, project-relative path
 * under `public/events/<eventId>/...` (see §9, "ASSET SECURITY") —
 * reusing the EXACT five-category taxonomy `event-art-pack.ts` already
 * established (`icons`/`decorations`/`modal`/`interactives`/
 * `backgrounds`), so a theme's assets resolve through the SAME asset
 * root every other Event Art surface already uses, never a parallel
 * pipeline. Deliberately rejects anything that isn't this exact shape —
 * no absolute filesystem paths (`C:\...`, `/etc/...`), no protocol-
 * prefixed remote URLs (`https://...`), no `..` traversal.
 */
const ASSET_CATEGORY_PATTERN =
  /^events\/[a-z0-9-]+\/(icons|decorations|modal|interactives|backgrounds)\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(png|svg|jpe?g|webp)$/;

export const fdraftThemeAssetPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((value) => !value.includes(".."), {
    message: 'Asset paths may not contain ".." (no path traversal).',
  })
  .refine((value) => ASSET_CATEGORY_PATTERN.test(value), {
    message:
      'Asset paths must look like "events/<eventId>/<category>/<file>" (category one of icons/decorations/modal/interactives/backgrounds) — no absolute paths, drive letters, or remote URLs.',
  });

/** Normalized 0-1 crop rectangle, portable and non-destructive — see §5. The renderer only ever RENDERS this; there is no crop-editing UI in normal FDraft. */
export const fdraftThemeCropRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .refine((crop) => crop.x + crop.width <= 1 + 1e-9, {
    message: "Crop rect x + width must not exceed 1.",
  })
  .refine((crop) => crop.y + crop.height <= 1 + 1e-9, {
    message: "Crop rect y + height must not exceed 1.",
  });
export type FDraftThemeCropRect = z.infer<typeof fdraftThemeCropRectSchema>;

const interactionIdSchema = z
  .enum(FDRAFT_THEME_INTERACTION_IDS)
  .nullable()
  .default(null);

/** Shared placement geometry/appearance — see §4. Both a FIXED placement and a WEIGHTED variant GROUP carry exactly this shape; only the content selection differs (`fdraftThemePlacementSchema`'s discriminated union below). */
const placementBaseSchema = z.object({
  id: z.string().trim().min(1).max(100),
  coordinateSpace: z.enum(FDRAFT_THEME_COORDINATE_SPACES).default("page"),
  anchor: z.enum(FDRAFT_THEME_ANCHORS).default("top-left"),
  offsetX: z.number().finite().default(0),
  offsetY: z.number().finite().default(0),
  /** rem units, matching this app's existing Designed Slot convention. `null` means "intrinsic asset size." */
  width: z.number().finite().positive().nullable().default(null),
  /** rem units. `null` combined with `aspectRatio` set preserves proportions from `width`; `null` with no `aspectRatio` means "intrinsic asset size." */
  height: z.number().finite().positive().nullable().default(null),
  /** width / height. Only consulted when `height` is `null` and `width` is set. */
  aspectRatio: z.number().finite().positive().nullable().default(null),
  /** Degrees. */
  rotation: z.number().finite().default(0),
  opacity: z.number().min(0).max(1).default(1),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
  layer: z.enum(FDRAFT_THEME_LAYERS).default("mid"),
  crop: fdraftThemeCropRectSchema.nullable().default(null),
  /** See `theme-interaction-ids.ts` — `null` means "purely decorative, no interaction." */
  interactionId: interactionIdSchema,
  visible: z.boolean().default(true),
});

/** A weighted content option within a WEIGHTED placement group — see §6. `assetId: null` is the explicit, first-class "nothing" option (§6/§7), not a special case bolted on separately. Per-variant tweaks are ADDITIVE to the shared placement's own base values, mirroring this app's existing `DecorationVariantTweak` convention. */
export const fdraftThemeWeightedVariantSchema = z.object({
  id: z.string().trim().min(1).max(100),
  assetId: z.string().trim().min(1).max(100).nullable(),
  weight: z.number().finite().min(0),
  scale: z.number().finite().positive().nullable().default(null),
  opacityOverride: z.number().min(0).max(1).nullable().default(null),
});
export type FDraftThemeWeightedVariant = z.infer<
  typeof fdraftThemeWeightedVariantSchema
>;

const fixedPlacementSchema = placementBaseSchema.extend({
  kind: z.literal("fixed"),
  /** `null` is a valid fixed placement too — e.g. a placement that's purely an `interactionId` with no separate backing image. */
  assetId: z.string().trim().min(1).max(100).nullable().default(null),
});

const weightedPlacementSchema = placementBaseSchema.extend({
  kind: z.literal("weighted"),
  variants: z.array(fdraftThemeWeightedVariantSchema).min(1).max(50),
});

export const fdraftThemePlacementSchema = z.discriminatedUnion("kind", [
  fixedPlacementSchema,
  weightedPlacementSchema,
]);
export type FDraftThemePlacement = z.infer<typeof fdraftThemePlacementSchema>;

const breakpointLayoutSchema = z.object({
  placements: z.array(fdraftThemePlacementSchema).max(200).default([]),
});
export type FDraftThemeBreakpointLayout = z.infer<
  typeof breakpointLayoutSchema
>;

const stateLayoutSchema = z.object({
  breakpoints: z
    .partialRecord(z.enum(FDRAFT_THEME_BREAKPOINT_IDS), breakpointLayoutSchema)
    .default({}),
});
export type FDraftThemeStateLayout = z.infer<typeof stateLayoutSchema>;

const pageLayoutSchema = z.object({
  states: z
    .record(z.string().trim().min(1).max(100), stateLayoutSchema)
    .default({}),
});
export type FDraftThemePageLayout = z.infer<typeof pageLayoutSchema>;

export const FDRAFT_THEME_SCOPES = ["event", "default"] as const;
export type FDraftThemeScope = (typeof FDRAFT_THEME_SCOPES)[number];

const baseFdraftThemeSchema = z.object({
  schemaVersion: z.literal(FDRAFT_THEME_CURRENT_SCHEMA_VERSION),
  themeId: z.string().trim().min(1).max(100),
  /** `null` for the `"default"` scope theme, which isn't tied to any one Event. */
  eventId: z.string().trim().min(1).max(100).nullable(),
  scope: z.enum(FDRAFT_THEME_SCOPES),
  displayName: z.string().trim().min(1).max(200).optional(),
  /** Symbolic asset id -> validated real path (see `fdraftThemeAssetPathSchema`) — every placement/variant `assetId` is a KEY into this map, resolved through the existing Event Asset root, never a literal path repeated inline. */
  assets: z
    .record(z.string().trim().min(1).max(100), fdraftThemeAssetPathSchema)
    .default({}),
  layouts: z
    .record(z.string().trim().min(1).max(100), pageLayoutSchema)
    .default({}),
});

/**
 * The full, cross-referentially-validated schema — every `assetId` a
 * placement or weighted variant references must exist as a key in
 * `assets` (a theme can never point at an asset it didn't declare), and
 * `scope: "event"` requires a real `eventId` (only `"default"` may have
 * `eventId: null`). Both checks run as `superRefine` so a violation
 * reports a clear, specific path rather than a generic top-level failure.
 */
export const fdraftThemeSchema = baseFdraftThemeSchema.superRefine(
  (theme, ctx) => {
    if (theme.scope === "event" && theme.eventId === null) {
      ctx.addIssue({
        code: "custom",
        message: 'An "event"-scoped theme must set a real eventId.',
        path: ["eventId"],
      });
    }

    const assetIds = new Set(Object.keys(theme.assets));
    const checkAssetId = (
      assetId: string | null,
      path: (string | number)[],
    ) => {
      if (assetId !== null && !assetIds.has(assetId)) {
        ctx.addIssue({
          code: "custom",
          message: `References asset id "${assetId}", which isn't declared in this theme's "assets" map.`,
          path,
        });
      }
    };

    for (const [pageId, page] of Object.entries(theme.layouts)) {
      for (const [stateId, state] of Object.entries(page.states)) {
        for (const [breakpointId, breakpoint] of Object.entries(
          state.breakpoints,
        )) {
          breakpoint?.placements.forEach((placement, index) => {
            const base = [
              "layouts",
              pageId,
              "states",
              stateId,
              "breakpoints",
              breakpointId,
              "placements",
              index,
            ];
            if (placement.kind === "fixed") {
              checkAssetId(placement.assetId, [...base, "assetId"]);
            } else {
              placement.variants.forEach((variant, variantIndex) => {
                checkAssetId(variant.assetId, [
                  ...base,
                  "variants",
                  variantIndex,
                  "assetId",
                ]);
              });
            }
          });
        }
      }
    }
  },
);

export type FDraftThemeFile = z.infer<typeof fdraftThemeSchema>;

export type FDraftThemeParseResult =
  | { ok: true; theme: FDraftThemeFile }
  | {
      ok: false;
      reason: "invalid_json" | "unsupported_schema_version" | "invalid_schema";
      message: string;
    };

/**
 * The ONE place raw, untrusted text (a bundled canonical file fetched
 * from `public/`, or a file an Admin picked for QA preview — see §14)
 * becomes a validated `FDraftThemeFile`, or a clear, typed rejection
 * reason (see §16, "Beta must reject it clearly rather than rendering
 * unpredictably"). Distinguishes malformed JSON from a schema violation
 * from a genuinely unsupported (newer) `schemaVersion`, so a caller can
 * show a useful, specific error rather than one generic failure message.
 */
export function parseFDraftThemeText(text: string): FDraftThemeParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return {
      ok: false,
      reason: "invalid_json",
      message:
        cause instanceof Error
          ? `Not valid JSON: ${cause.message}`
          : "Not valid JSON.",
    };
  }

  if (
    typeof raw === "object" &&
    raw !== null &&
    "schemaVersion" in raw &&
    typeof (raw as { schemaVersion: unknown }).schemaVersion === "number" &&
    (raw as { schemaVersion: number }).schemaVersion >
      FDRAFT_THEME_CURRENT_SCHEMA_VERSION
  ) {
    return {
      ok: false,
      reason: "unsupported_schema_version",
      message: `This theme file's schemaVersion (${(raw as { schemaVersion: number }).schemaVersion}) is newer than the highest this build supports (${FDRAFT_THEME_CURRENT_SCHEMA_VERSION}). Update FDraft to use it.`,
    };
  }

  const result = fdraftThemeSchema.safeParse(raw);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path.join(".") || "(root)";
    return {
      ok: false,
      reason: "invalid_schema",
      message: firstIssue
        ? `${path}: ${firstIssue.message}`
        : "This theme file doesn't match the expected format.",
    };
  }
  return { ok: true, theme: result.data };
}
