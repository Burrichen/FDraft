/**
 * The pieces of film/user data a challenge (or a stats card) might depend
 * on. Shared between the film metadata provider boundary and the challenge
 * engine so both speak the same vocabulary for "what do we actually have
 * data for?" — see docs/product-spec.md, "Data Provider Rule".
 */
export type DataCapability =
  | "runtime"
  | "genres"
  | "directors"
  | "countries"
  | "languages"
  | "collection"
  | "average_rating"
  | "popularity"
  | "watch_count"
  | "fans_count"
  | "list_appearances"
  | "watched_history"
  | "user_ratings"
  | "previous_draft_pick"
  | "primary_language";
