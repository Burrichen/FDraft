import { isTauri } from "@tauri-apps/api/core";

/**
 * Whether the app is running inside the Tauri desktop shell rather than a
 * normal browser tab — the one check every desktop-only feature (metadata
 * transport, the updater) branches on, so a single shared wrapper here
 * keeps that check consistent rather than each feature reimplementing it.
 */
export function isDesktopRuntime(): boolean {
  return isTauri();
}
