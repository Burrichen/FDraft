use std::path::PathBuf;

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

#[tauri::command]
fn get_tmdb_api_key() -> Option<String> {
  std::env::var("TMDB_API_KEY")
    .ok()
    .filter(|key| !key.is_empty())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  load_project_env();

  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .invoke_handler(tauri::generate_handler![get_tmdb_api_key])
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
