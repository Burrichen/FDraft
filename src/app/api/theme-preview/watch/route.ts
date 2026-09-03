import { NextResponse, type NextRequest } from "next/server";
import {
  getLocalThemeFileMtimeMs,
  isThemePreviewEnabled,
  ThemePreviewPathError,
} from "@/application/theme-runtime/theme-preview-server";

/**
 * The local-only reload protocol's server half (see
 * `theme-preview-server.ts`'s own doc comment, and docs/updates, "FDRAFT
 * THEME RUNTIME — PROMPT 10": "a local-only reload protocol that Prompt
 * 11 can use without exposing a network listener beyond the local
 * machine"). Returns the file's current mtime for a caller to compare
 * against on an interval — plain polling, not a websocket/SSE push, and
 * not a new listener: this rides the same dev-server route Next.js
 * already binds to localhost.
 */
export async function GET(request: NextRequest) {
  if (!isThemePreviewEnabled()) {
    return NextResponse.json({ status: "disabled" }, { status: 404 });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json(
      { status: "invalid-request", message: "Missing ?path=" },
      { status: 400 },
    );
  }

  try {
    const mtimeMs = await getLocalThemeFileMtimeMs(path);
    return NextResponse.json({ status: "ok", mtimeMs });
  } catch (cause) {
    if (cause instanceof ThemePreviewPathError) {
      return NextResponse.json(
        { status: "invalid-path", message: cause.message },
        { status: 400 },
      );
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json(
      { status: "read-failed", message },
      { status: 404 },
    );
  }
}
