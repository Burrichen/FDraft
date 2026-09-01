import { isDesktopRuntime } from "./desktop-runtime";

/**
 * TRUE OS window fullscreen (see docs/updates, "EVENT STUDIO — PHASE 8"
 * §9) — deliberately separate from Studio's own "Fullscreen Edit" mode
 * (which only hides Studio's own chrome inside the app window; see
 * `studio-page-client.tsx`). This toggles the actual Tauri window, and
 * is entirely optional — a no-op outside the desktop shell (a plain
 * browser tab has no window chrome to control) rather than an error.
 */
export async function toggleWindowFullscreen(): Promise<void> {
  if (!isDesktopRuntime()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const isFullscreen = await win.isFullscreen();
    await win.setFullscreen(!isFullscreen);
  } catch {
    // Degrade silently — this is a convenience action, never load-bearing.
  }
}
