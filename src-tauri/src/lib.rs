use std::path::{Path, PathBuf};
use base64::Engine;
use serde::Serialize;

/// FDraft's web build keeps `TMDB_API_KEY` server-side only, read by
/// `src/app/api/metadata/route.ts` from `.env.local` via Next's own env
/// loading (see `.env.example`). The desktop build has no such server to
/// hide it behind — see docs/product-spec.md's Tauri integration notes —
/// so this reads the SAME `.env.local` file (falling back to `.env`) at
/// startup and exposes it to the frontend on request via `get_tmdb_api_key`,
/// keeping the key out of the compiled JS bundle at least. Resolved
/// relative to `CARGO_MANIFEST_DIR` (always `src-tauri/`), one level up to
/// the actual project root where the web app's env files live.
fn load_project_env() {
  let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("src-tauri always has a parent directory")
    .to_path_buf();

  // `.env.local` wins, matching Next.js's own precedence — loaded first
  // since dotenvy never overwrites a variable already set.
  let _ = dotenvy::from_path(project_root.join(".env.local"));
  let _ = dotenvy::from_path(project_root.join(".env"));
}

/// A production release install has no project checkout next to it for
/// `load_project_env()` to find — `.env.local` only ever exists on a dev
/// machine or the CI runner that builds the release. `option_env!` reads
/// `TMDB_API_KEY` at COMPILE time instead, baking it directly into the
/// release binary when the release workflow sets it as a build-time env
/// var (from the `TMDB_API_KEY` GitHub secret — see the release workflow
/// and README). A local `cargo build`/`tauri dev` run, with no such
/// variable set at compile time, gets `None` here and falls through to the
/// existing runtime `.env.local`/`.env` read below exactly as before — this
/// is additive, not a replacement, for the dev workflow.
#[tauri::command]
fn get_tmdb_api_key() -> Option<String> {
  if let Some(key) = option_env!("TMDB_API_KEY") {
    if !key.is_empty() {
      return Some(key.to_string());
    }
  }
  std::env::var("TMDB_API_KEY")
    .ok()
    .filter(|key| !key.is_empty())
}

/// The FDraft repo markers `validate_event_art_workspace_folder` looks
/// for (see docs/updates, "EVENT STUDIO — PHASE 2" §7/§8) — a plain
/// `std::fs` check, no filesystem plugin needed: `public/events/` and
/// `public/event-themes/` are the two real, already-committed folders
/// every Event's art/theme files actually live under (see
/// `event-art-pack.ts`/`fdraft-theme-schema.ts`), and `package.json`
/// containing FDraft's own package name is a cheap extra sanity check
/// against a folder that merely happens to have similarly-named
/// subfolders. Never writes anything — read-only checks only.
#[derive(Serialize)]
struct WorkspaceValidationResult {
  valid: bool,
  missing: Vec<String>,
}

#[tauri::command]
fn validate_event_art_workspace_folder(path: String) -> WorkspaceValidationResult {
  let root = Path::new(&path);
  let mut missing = Vec::new();

  if !root.join("public").join("events").is_dir() {
    missing.push("public/events/".to_string());
  }
  if !root.join("public").join("event-themes").is_dir() {
    missing.push("public/event-themes/".to_string());
  }

  let package_json_ok = std::fs::read_to_string(root.join("package.json"))
    .ok()
    .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
    .and_then(|value| value.get("name").and_then(|n| n.as_str()).map(String::from))
    .map(|name| name == "fdraft")
    .unwrap_or(false);
  if !package_json_ok {
    missing.push("package.json (expected \"name\": \"fdraft\")".to_string());
  }

  WorkspaceValidationResult {
    valid: missing.is_empty(),
    missing,
  }
}

/// The exact five categories `.fdraft-theme`'s own asset path validation
/// already recognizes (see `fdraft-theme-schema.ts`'s `ASSET_CATEGORY_PATTERN`)
/// — kept in this exact order/spelling so a scanned workspace asset's
/// `relativePath` is always shaped exactly like a real theme file's own
/// `assets` map values, and can be pasted straight into one.
const ASSET_CATEGORIES: [&str; 5] =
  ["icons", "decorations", "modal", "interactives", "backgrounds"];

/// Recognised image extensions (see docs/updates, "EVENT STUDIO — PHASE 4"
/// §2: "Recognise at minimum: .png .webp .svg") — matched case-
/// insensitively; `.jpg`/`.jpeg` included too since the schema's own
/// `ASSET_CATEGORY_PATTERN` already accepts them.
const ASSET_EXTENSIONS: [&str; 5] = ["png", "webp", "svg", "jpg", "jpeg"];

#[derive(Serialize, Clone)]
struct WorkspaceAssetEntry {
  #[serde(rename = "relativePath")]
  relative_path: String,
  #[serde(rename = "eventId")]
  event_id: String,
  category: String,
  #[serde(rename = "fileName")]
  file_name: String,
}

/// Live-scans `<path>/public/events/<eventId>/<category>/*` for recognised
/// image files (see docs/updates, "EVENT STUDIO — PHASE 4" §2) — a plain
/// read-only `std::fs::read_dir` walk, no filesystem plugin/capability
/// needed (same convention as `validate_event_art_workspace_folder`).
/// Every event id folder AND category folder that actually exists is
/// scanned — nothing is hardcoded beyond the fixed category taxonomy
/// itself, so a brand-new event folder (or a future category some later
/// phase adds) is picked up automatically on the next scan, no code
/// change required. Returns an empty list (never an error) for a
/// workspace with no `public/events/` folder at all, or one that's
/// otherwise unreadable — the frontend treats an empty result as "nothing
/// found yet," not a hard failure.
#[tauri::command]
fn scan_event_art_workspace_assets(path: String) -> Vec<WorkspaceAssetEntry> {
  let events_root = Path::new(&path).join("public").join("events");
  let mut results = Vec::new();

  let Ok(event_dirs) = std::fs::read_dir(&events_root) else {
    return results;
  };
  for event_entry in event_dirs.flatten() {
    let event_path = event_entry.path();
    if !event_path.is_dir() {
      continue;
    }
    let Some(event_id) = event_path.file_name().and_then(|n| n.to_str()) else {
      continue;
    };

    for category in ASSET_CATEGORIES {
      let category_path = event_path.join(category);
      let Ok(files) = std::fs::read_dir(&category_path) else {
        continue;
      };
      for file_entry in files.flatten() {
        let file_path = file_entry.path();
        if !file_path.is_file() {
          continue;
        }
        let Some(file_name) = file_path.file_name().and_then(|n| n.to_str()) else {
          continue;
        };
        let Some(ext) = file_path.extension().and_then(|e| e.to_str()) else {
          continue;
        };
        if !ASSET_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
          continue;
        }
        results.push(WorkspaceAssetEntry {
          relative_path: format!("events/{}/{}/{}", event_id, category, file_name),
          event_id: event_id.to_string(),
          category: category.to_string(),
          file_name: file_name.to_string(),
        });
      }
    }
  }

  results.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
  results
}

fn mime_type_for_extension(extension: &str) -> &'static str {
  match extension.to_lowercase().as_str() {
    "png" => "image/png",
    "webp" => "image/webp",
    "svg" => "image/svg+xml",
    "jpg" | "jpeg" => "image/jpeg",
    _ => "application/octet-stream",
  }
}

/// Reads one workspace asset's bytes and returns them as a `data:` URI
/// (see docs/updates, "EVENT STUDIO — PHASE 4" §2/§3: thumbnails for a
/// LIVE, user-chosen folder outside the app's own bundle) — avoids
/// needing to add the workspace folder to Tauri's asset-protocol scope at
/// runtime (a much larger surface change) for what's fundamentally a
/// handful of small decoration images. `relative_asset_path` MUST look
/// like `events/<id>/<category>/<file>` (the exact shape
/// `scan_event_art_workspace_assets` itself produces) and is defensively
/// re-validated here too — never trusted just because it came from the
/// frontend, the same "read-only, no traversal" carefulness
/// `validate_event_art_workspace_folder` already applies. Canonicalizing
/// both the workspace's `public/` root and the requested file and
/// requiring the file to still be a descendant of that root is what
/// actually defeats a crafted `..`/symlink escape, not the substring
/// check alone (which is only a cheap first rejection).
#[tauri::command]
fn read_event_art_workspace_asset(
  path: String,
  relative_asset_path: String,
) -> Result<String, String> {
  let normalized = relative_asset_path.trim_start_matches('/');
  if normalized.contains("..") || !normalized.starts_with("events/") {
    return Err("Invalid asset path.".to_string());
  }

  let public_root = Path::new(&path).join("public");
  let candidate = public_root.join(normalized);

  let canonical_root = std::fs::canonicalize(&public_root)
    .map_err(|_| "Workspace not found.".to_string())?;
  let canonical_file =
    std::fs::canonicalize(&candidate).map_err(|_| "Asset not found.".to_string())?;
  if !canonical_file.starts_with(&canonical_root) {
    return Err("Invalid asset path.".to_string());
  }
  if !canonical_file.is_file() {
    return Err("Asset not found.".to_string());
  }

  let bytes =
    std::fs::read(&canonical_file).map_err(|_| "Could not read asset.".to_string())?;
  let extension = canonical_file
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("");
  let mime = mime_type_for_extension(extension);
  let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
  Ok(format!("data:{};base64,{}", mime, encoded))
}

/// Live-checks a batch of `theme.assets` relative paths against a
/// connected workspace's actual filesystem (see docs/updates, "EVENT
/// STUDIO — PHASE 6" §11: "Check referenced assets against the
/// connected Git workspace") — distinct from `.fdraft-theme`'s own zod
/// validation, which only checks that an `assetId` KEY exists in the
/// theme's own `assets` map, never whether the FILE it points at is
/// actually still on disk. Read-only; a path that fails the same
/// `events/<id>/<category>/<file>`-shape + no-traversal check
/// `read_event_art_workspace_asset` already enforces is reported simply
/// as "does not exist" rather than a separate error variant — the
/// frontend only ever needs a yes/no per path here.
#[tauri::command]
fn check_event_art_workspace_asset_paths(
  path: String,
  relative_paths: Vec<String>,
) -> std::collections::HashMap<String, bool> {
  let public_root = Path::new(&path).join("public");
  let canonical_root = match std::fs::canonicalize(&public_root) {
    Ok(root) => root,
    Err(_) => {
      return relative_paths.into_iter().map(|p| (p, false)).collect();
    }
  };

  relative_paths
    .into_iter()
    .map(|relative_path| {
      let normalized = relative_path.trim_start_matches('/');
      let exists = if normalized.contains("..") || !normalized.starts_with("events/") {
        false
      } else {
        std::fs::canonicalize(public_root.join(normalized))
          .map(|full| full.starts_with(&canonical_root) && full.is_file())
          .unwrap_or(false)
      };
      (relative_path, exists)
    })
    .collect()
}

/// Whether `theme_id` is safe to interpolate into a filesystem path —
/// the schema's own `themeId` field (`fdraft-theme-schema.ts`) allows any
/// non-empty string up to 100 characters, no character restriction, so a
/// malformed or crafted theme file could otherwise smuggle a `/` or `..`
/// straight into a write target. Never trust the JS side's own validation
/// alone for something that ends up in a filesystem write.
fn is_safe_theme_id(theme_id: &str) -> bool {
  !theme_id.is_empty()
    && !theme_id.contains('/')
    && !theme_id.contains('\\')
    && !theme_id.contains("..")
}

/// Reads the CURRENT canonical theme file at `public/event-themes/<theme_id>.fdraft-theme`,
/// if one exists — see docs/updates, "EVENT STUDIO — PHASE 6" §12:
/// "Automatically create a backup/revision where sensible" — the
/// frontend calls this immediately before a repo write, to capture
/// whatever was there as a Studio revision first. `Ok(None)` (not an
/// error) when there's nothing there yet — a genuinely new theme has no
/// "before" state to back up.
#[tauri::command]
fn read_canonical_theme_file(path: String, theme_id: String) -> Result<Option<String>, String> {
  if !is_safe_theme_id(&theme_id) {
    return Err("Invalid theme id.".to_string());
  }
  let target = Path::new(&path)
    .join("public")
    .join("event-themes")
    .join(format!("{}.fdraft-theme", theme_id));
  if !target.is_file() {
    return Ok(None);
  }
  std::fs::read_to_string(&target)
    .map(Some)
    .map_err(|_| "Could not read the existing canonical theme file.".to_string())
}

/// Writes `contents` to the canonical theme location Phase 1 established
/// (`public/event-themes/<theme_id>.fdraft-theme`) — see docs/updates,
/// "EVENT STUDIO — PHASE 6" §12: "Export to FDraft Repo." The ONLY write-
/// capable command in this file; confirmation (before overwriting an
/// existing file) and the backup-revision step both happen on the JS
/// side BEFORE this is ever called — this command itself always writes
/// unconditionally, exactly once, and never runs any `git` command (see
/// §12: "Do not run Git commit/push automatically" — this binary never
/// shells out to git at all).
#[tauri::command]
fn write_canonical_theme_file(
  path: String,
  theme_id: String,
  contents: String,
) -> Result<(), String> {
  if !is_safe_theme_id(&theme_id) {
    return Err("Invalid theme id.".to_string());
  }
  let dir = Path::new(&path).join("public").join("event-themes");
  if !dir.is_dir() {
    return Err("This workspace has no public/event-themes/ folder.".to_string());
  }
  let target = dir.join(format!("{}.fdraft-theme", theme_id));
  std::fs::write(&target, contents)
    .map_err(|error| format!("Could not write the theme file: {}", error))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn accepts_the_real_fdraft_repo_root() {
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .parent()
      .unwrap()
      .to_path_buf();
    let result = validate_event_art_workspace_folder(
      repo_root.to_string_lossy().to_string(),
    );
    assert!(result.valid, "missing: {:?}", result.missing);
    assert!(result.missing.is_empty());
  }

  #[test]
  fn rejects_a_folder_with_none_of_the_expected_markers() {
    let scratch = std::env::temp_dir().join(format!(
      "fdraft-workspace-validate-test-empty-{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::create_dir_all(&scratch).unwrap();

    let result =
      validate_event_art_workspace_folder(scratch.to_string_lossy().to_string());

    assert!(!result.valid);
    assert_eq!(result.missing.len(), 3);

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn reports_exactly_which_markers_are_missing() {
    let scratch = std::env::temp_dir().join(format!(
      "fdraft-workspace-validate-test-partial-{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::create_dir_all(scratch.join("public").join("events")).unwrap();
    // Deliberately no public/event-themes/ and no package.json.

    let result =
      validate_event_art_workspace_folder(scratch.to_string_lossy().to_string());

    assert!(!result.valid);
    assert!(!result.missing.iter().any(|m| m.contains("public/events")));
    assert!(result.missing.iter().any(|m| m.contains("event-themes")));
    assert!(result.missing.iter().any(|m| m.contains("package.json")));

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn rejects_a_package_json_with_the_wrong_name() {
    let scratch = std::env::temp_dir().join(format!(
      "fdraft-workspace-validate-test-wrongname-{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::create_dir_all(scratch.join("public").join("events")).unwrap();
    std::fs::create_dir_all(scratch.join("public").join("event-themes")).unwrap();
    std::fs::write(scratch.join("package.json"), r#"{"name": "not-fdraft"}"#)
      .unwrap();

    let result =
      validate_event_art_workspace_folder(scratch.to_string_lossy().to_string());

    assert!(!result.valid);
    assert_eq!(result.missing.len(), 1);
    assert!(result.missing[0].contains("package.json"));

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn accepts_a_synthetic_folder_with_every_marker_present() {
    let scratch = std::env::temp_dir().join(format!(
      "fdraft-workspace-validate-test-valid-{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::create_dir_all(scratch.join("public").join("events")).unwrap();
    std::fs::create_dir_all(scratch.join("public").join("event-themes")).unwrap();
    std::fs::write(scratch.join("package.json"), r#"{"name": "fdraft"}"#).unwrap();

    let result =
      validate_event_art_workspace_folder(scratch.to_string_lossy().to_string());

    assert!(result.valid);
    assert!(result.missing.is_empty());

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn never_writes_anything_inside_the_folder_it_validates() {
    let scratch = std::env::temp_dir().join(format!(
      "fdraft-workspace-validate-test-readonly-{}",
      std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::create_dir_all(&scratch).unwrap();
    let before: Vec<_> = std::fs::read_dir(&scratch).unwrap().collect();
    assert_eq!(before.len(), 0);

    let _ = validate_event_art_workspace_folder(scratch.to_string_lossy().to_string());

    let after: Vec<_> = std::fs::read_dir(&scratch).unwrap().collect();
    assert_eq!(after.len(), 0, "validation must never create files/folders");

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  fn scratch_workspace(name: &str) -> PathBuf {
    let scratch = std::env::temp_dir().join(format!(
      "fdraft-{}-{}-{}",
      name,
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ));
    let _ = std::fs::remove_dir_all(&scratch);
    std::fs::create_dir_all(&scratch).unwrap();
    scratch
  }

  #[test]
  fn scan_finds_recognised_files_across_multiple_events_and_categories() {
    let scratch = scratch_workspace("scan-basic");
    std::fs::create_dir_all(
      scratch.join("public").join("events").join("halloween").join("interactives"),
    )
    .unwrap();
    std::fs::write(
      scratch
        .join("public")
        .join("events")
        .join("halloween")
        .join("interactives")
        .join("pumpkin-lit.png"),
      b"fake-png",
    )
    .unwrap();
    std::fs::create_dir_all(
      scratch.join("public").join("events").join("christmas").join("decorations"),
    )
    .unwrap();
    std::fs::write(
      scratch
        .join("public")
        .join("events")
        .join("christmas")
        .join("decorations")
        .join("lights.svg"),
      b"<svg></svg>",
    )
    .unwrap();

    let result = scan_event_art_workspace_assets(scratch.to_string_lossy().to_string());

    assert_eq!(result.len(), 2);
    assert!(result.iter().any(|entry| entry.relative_path
      == "events/halloween/interactives/pumpkin-lit.png"
      && entry.event_id == "halloween"
      && entry.category == "interactives"
      && entry.file_name == "pumpkin-lit.png"));
    assert!(result
      .iter()
      .any(|entry| entry.relative_path == "events/christmas/decorations/lights.svg"));

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn scan_ignores_unrecognised_extensions_and_non_category_files() {
    let scratch = scratch_workspace("scan-ignore");
    let halloween =
      scratch.join("public").join("events").join("halloween").join("interactives");
    std::fs::create_dir_all(&halloween).unwrap();
    std::fs::write(halloween.join("notes.txt"), b"not an image").unwrap();
    std::fs::write(
      scratch.join("public").join("events").join("halloween").join("manifest.json"),
      b"{}",
    )
    .unwrap();

    let result = scan_event_art_workspace_assets(scratch.to_string_lossy().to_string());

    assert!(result.is_empty());

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn scan_returns_empty_for_a_workspace_with_no_events_folder() {
    let scratch = scratch_workspace("scan-empty");
    let result = scan_event_art_workspace_assets(scratch.to_string_lossy().to_string());
    assert!(result.is_empty());
    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn read_asset_returns_a_correctly_typed_data_uri() {
    let scratch = scratch_workspace("read-basic");
    let dir = scratch.join("public").join("events").join("halloween").join("interactives");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("pumpkin-lit.png"), b"fake-png-bytes").unwrap();

    let result = read_event_art_workspace_asset(
      scratch.to_string_lossy().to_string(),
      "events/halloween/interactives/pumpkin-lit.png".to_string(),
    );

    assert!(result.is_ok());
    let data_uri = result.unwrap();
    assert!(data_uri.starts_with("data:image/png;base64,"));
    let encoded = data_uri.strip_prefix("data:image/png;base64,").unwrap();
    let decoded = base64::engine::general_purpose::STANDARD.decode(encoded).unwrap();
    assert_eq!(decoded, b"fake-png-bytes");

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn read_asset_rejects_path_traversal() {
    let scratch = scratch_workspace("read-traversal");
    std::fs::create_dir_all(scratch.join("public").join("events")).unwrap();
    std::fs::write(scratch.join("secret.txt"), b"top secret").unwrap();

    let result = read_event_art_workspace_asset(
      scratch.to_string_lossy().to_string(),
      "events/../../secret.txt".to_string(),
    );

    assert!(result.is_err());

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn read_asset_rejects_a_path_outside_the_events_folder() {
    let scratch = scratch_workspace("read-outside");
    std::fs::create_dir_all(scratch.join("public")).unwrap();
    std::fs::write(scratch.join("public").join("secret.txt"), b"top secret").unwrap();

    let result = read_event_art_workspace_asset(
      scratch.to_string_lossy().to_string(),
      "secret.txt".to_string(),
    );

    assert!(result.is_err());

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn read_asset_reports_a_clear_error_for_a_nonexistent_file() {
    let scratch = scratch_workspace("read-missing");
    std::fs::create_dir_all(scratch.join("public").join("events")).unwrap();

    let result = read_event_art_workspace_asset(
      scratch.to_string_lossy().to_string(),
      "events/halloween/interactives/does-not-exist.png".to_string(),
    );

    assert!(result.is_err());

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn check_asset_paths_reports_true_for_real_files_and_false_for_missing_ones() {
    let scratch = scratch_workspace("check-paths");
    let dir = scratch.join("public").join("events").join("halloween").join("interactives");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("ghost-1.png"), b"fake").unwrap();

    let result = check_event_art_workspace_asset_paths(
      scratch.to_string_lossy().to_string(),
      vec![
        "events/halloween/interactives/ghost-1.png".to_string(),
        "events/halloween/interactives/missing-cat.png".to_string(),
      ],
    );

    assert_eq!(
      result.get("events/halloween/interactives/ghost-1.png"),
      Some(&true)
    );
    assert_eq!(
      result.get("events/halloween/interactives/missing-cat.png"),
      Some(&false)
    );

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn check_asset_paths_never_throws_on_a_traversal_attempt_it_just_reports_false() {
    let scratch = scratch_workspace("check-paths-traversal");
    std::fs::create_dir_all(scratch.join("public").join("events")).unwrap();

    let result = check_event_art_workspace_asset_paths(
      scratch.to_string_lossy().to_string(),
      vec!["events/../../etc/passwd".to_string()],
    );

    assert_eq!(result.get("events/../../etc/passwd"), Some(&false));

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn read_canonical_theme_returns_none_when_nothing_exists_yet() {
    let scratch = scratch_workspace("read-canonical-none");
    std::fs::create_dir_all(scratch.join("public").join("event-themes")).unwrap();

    let result =
      read_canonical_theme_file(scratch.to_string_lossy().to_string(), "halloween".to_string());

    assert_eq!(result, Ok(None));

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn read_canonical_theme_returns_the_existing_contents() {
    let scratch = scratch_workspace("read-canonical-existing");
    let dir = scratch.join("public").join("event-themes");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("halloween.fdraft-theme"), "{\"themeId\":\"halloween\"}").unwrap();

    let result =
      read_canonical_theme_file(scratch.to_string_lossy().to_string(), "halloween".to_string());

    assert_eq!(result, Ok(Some("{\"themeId\":\"halloween\"}".to_string())));

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn read_canonical_theme_rejects_an_unsafe_theme_id() {
    let scratch = scratch_workspace("read-canonical-unsafe");
    std::fs::create_dir_all(scratch.join("public").join("event-themes")).unwrap();

    let result = read_canonical_theme_file(
      scratch.to_string_lossy().to_string(),
      "../../etc/passwd".to_string(),
    );

    assert!(result.is_err());

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn write_canonical_theme_creates_a_new_file() {
    let scratch = scratch_workspace("write-canonical-new");
    std::fs::create_dir_all(scratch.join("public").join("event-themes")).unwrap();

    let result = write_canonical_theme_file(
      scratch.to_string_lossy().to_string(),
      "halloween".to_string(),
      "{\"themeId\":\"halloween\"}".to_string(),
    );

    assert!(result.is_ok());
    let written = std::fs::read_to_string(
      scratch.join("public").join("event-themes").join("halloween.fdraft-theme"),
    )
    .unwrap();
    assert_eq!(written, "{\"themeId\":\"halloween\"}");

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn write_canonical_theme_overwrites_an_existing_file() {
    let scratch = scratch_workspace("write-canonical-overwrite");
    let dir = scratch.join("public").join("event-themes");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("halloween.fdraft-theme"), "old contents").unwrap();

    let result = write_canonical_theme_file(
      scratch.to_string_lossy().to_string(),
      "halloween".to_string(),
      "new contents".to_string(),
    );

    assert!(result.is_ok());
    let written = std::fs::read_to_string(dir.join("halloween.fdraft-theme")).unwrap();
    assert_eq!(written, "new contents");

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn write_canonical_theme_rejects_an_unsafe_theme_id() {
    let scratch = scratch_workspace("write-canonical-unsafe");
    std::fs::create_dir_all(scratch.join("public").join("event-themes")).unwrap();

    let result = write_canonical_theme_file(
      scratch.to_string_lossy().to_string(),
      "../../etc/passwd".to_string(),
      "malicious".to_string(),
    );

    assert!(result.is_err());
    assert!(
      !scratch.join("public").join("event-themes").join("passwd.fdraft-theme").exists()
    );

    std::fs::remove_dir_all(&scratch).unwrap();
  }

  #[test]
  fn write_canonical_theme_fails_cleanly_when_the_workspace_has_no_event_themes_folder() {
    let scratch = scratch_workspace("write-canonical-no-folder");
    std::fs::create_dir_all(&scratch).unwrap();

    let result = write_canonical_theme_file(
      scratch.to_string_lossy().to_string(),
      "halloween".to_string(),
      "contents".to_string(),
    );

    assert!(result.is_err());

    std::fs::remove_dir_all(&scratch).unwrap();
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  load_project_env();

  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      get_tmdb_api_key,
      validate_event_art_workspace_folder,
      scan_event_art_workspace_assets,
      read_event_art_workspace_asset,
      check_event_art_workspace_asset_paths,
      read_canonical_theme_file,
      write_canonical_theme_file
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
