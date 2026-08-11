#!/usr/bin/env -S pnpm dlx tsx
/**
 * One-time export of a single user's data out of an EXTERNAL Supabase
 * project running this app's pre-9.5B schema (this repo no longer runs its
 * own Supabase backend — see docs/product-spec.md implementation log,
 * Prompt 9.5B, "REMOVE UNNECESSARY REMOTE INFRASTRUCTURE"), into a JSON
 * file matching `src/migration/supabase-export-types.ts`'s
 * `SupabaseExportData` shape. See docs/product-spec.md, "MIGRATION OF
 * EXISTING DATA" (Prompt 9.5A): "Do not silently destroy existing data...
 * document how existing data can be exported before remote persistence is
 * removed."
 *
 * This script is READ-ONLY — it never writes to or deletes from Supabase.
 * It uses the SECRET (service_role) key to read across every table
 * regardless of RLS, since the point is a complete, faithful export.
 *
 * Usage:
 *   pnpm dlx tsx scripts/export-supabase-data.ts <user-email> [output-path]
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY for that
 * (external, separately hosted) Supabase project — this app itself no
 * longer needs or reads those variables for anything else.
 *
 * The resulting file is what `migrateFromSupabaseExport`
 * (src/migration/migrate-from-supabase-export.ts) consumes to create an
 * equivalent local profile. There is no import UI wired up for this yet
 * (deliberately deferred — see docs/product-spec.md implementation log,
 * Phase 9.5A) — for now, load the exported JSON and call that function
 * directly (e.g. from a scratch script or the browser console against the
 * app's own `createLocalRepositories()`).
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

async function main() {
  const email = process.argv[2];
  const outputPath = process.argv[3] ?? `supabase-export-${Date.now()}.json`;
  if (!email) {
    console.error(
      "Usage: pnpm dlx tsx scripts/export-supabase-data.ts <user-email> [output-path]",
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in the environment (see .env.local).",
    );
    process.exit(1);
  }

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users, error: userError } = await admin.auth.admin.listUsers();
  if (userError) {
    throw new Error(`Failed to list users: ${userError.message}`);
  }
  const user = users.users.find((u) => u.email === email);
  if (!user) {
    throw new Error(`No user found with email ${email}`);
  }
  const userId = user.id;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (profileError || !profile) {
    throw new Error(
      `Failed to load profile: ${profileError?.message ?? "not found"}`,
    );
  }

  const { data: entries, error: entriesError } = await admin
    .from("watchlist_entries")
    .select("*")
    .eq("user_id", userId);
  if (entriesError)
    throw new Error(
      `Failed to load watchlist_entries: ${entriesError.message}`,
    );

  const filmIds = Array.from(new Set((entries ?? []).map((e) => e.film_id)));

  const { data: films, error: filmsError } = filmIds.length
    ? await admin.from("films").select("*").in("id", filmIds)
    : { data: [], error: null };
  if (filmsError)
    throw new Error(`Failed to load films: ${filmsError.message}`);

  const { data: filmMetadata, error: metadataError } = filmIds.length
    ? await admin.from("film_metadata").select("*").in("film_id", filmIds)
    : { data: [], error: null };
  if (metadataError)
    throw new Error(`Failed to load film_metadata: ${metadataError.message}`);

  const { data: watchedHistory, error: historyError } = await admin
    .from("watched_history")
    .select("*")
    .eq("user_id", userId);
  if (historyError)
    throw new Error(`Failed to load watched_history: ${historyError.message}`);

  const { data: userRatings, error: ratingsError } = await admin
    .from("user_ratings")
    .select("*")
    .eq("user_id", userId);
  if (ratingsError)
    throw new Error(`Failed to load user_ratings: ${ratingsError.message}`);

  const { data: drafts, error: draftsError } = await admin
    .from("drafts")
    .select("*")
    .eq("user_id", userId);
  if (draftsError)
    throw new Error(`Failed to load drafts: ${draftsError.message}`);

  const draftIds = (drafts ?? []).map((d) => d.id);
  const { data: draftItems, error: itemsError } = draftIds.length
    ? await admin.from("draft_items").select("*").in("draft_id", draftIds)
    : { data: [], error: null };
  if (itemsError)
    throw new Error(`Failed to load draft_items: ${itemsError.message}`);

  const { data: postmortemResponses, error: postmortemError } = draftIds.length
    ? await admin
        .from("draft_postmortem_responses")
        .select("*")
        .in("draft_id", draftIds)
    : { data: [], error: null };
  if (postmortemError)
    throw new Error(
      `Failed to load draft_postmortem_responses: ${postmortemError.message}`,
    );

  const entryIds = (entries ?? []).map((e) => e.id);
  const { data: weightAdjustments, error: weightError } = entryIds.length
    ? await admin
        .from("selection_weight_adjustments")
        .select("*")
        .in("watchlist_entry_id", entryIds)
    : { data: [], error: null };
  if (weightError)
    throw new Error(
      `Failed to load selection_weight_adjustments: ${weightError.message}`,
    );

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      display_name: profile.display_name,
      timezone: profile.timezone,
      created_at: profile.created_at,
    },
    films: films ?? [],
    film_metadata: filmMetadata ?? [],
    watchlist_entries: entries ?? [],
    watched_history: watchedHistory ?? [],
    user_ratings: userRatings ?? [],
    drafts: drafts ?? [],
    draft_items: draftItems ?? [],
    draft_postmortem_responses: postmortemResponses ?? [],
    selection_weight_adjustments: weightAdjustments ?? [],
  };

  writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`Exported ${email} (${userId}) to ${outputPath}:`);
  console.log(
    `  ${exportData.films.length} films, ${exportData.watchlist_entries.length} watchlist entries`,
  );
  console.log(
    `  ${exportData.drafts.length} drafts, ${exportData.draft_items.length} draft items`,
  );
  console.log(
    `  ${exportData.watched_history.length} watched history rows, ${exportData.user_ratings.length} ratings`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
