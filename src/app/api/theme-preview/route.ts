import { NextResponse, type NextRequest } from "next/server";
import {
  isThemePreviewEnabled,
  readLocalThemeFile,
  ThemePreviewPathError,
} from "@/application/theme-runtime/theme-preview-server";

/**
 * Development-only local `.fdtheme` file server (see docs/updates,
 * "FDRAFT THEME RUNTIME — PROMPT 10", "an explicitly development-only
 * launch option equivalent to `--theme-preview <local-path>`") — see
 * `theme-preview-server.ts`'s own doc comment for why a dev-only API
 * route is the closest faithful equivalent in a Next.js dev server, and
 * for why every function it calls is already inert in production
 * regardless of whether this route itself is ever reached. Bound to
 * whatever host/port the Next.js dev server itself binds to (localhost
 * by default) — this introduces no separate network listener.
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
    const bytes = await readLocalThemeFile(path);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  } catch (cause) {
    if (cause instanceof ThemePreviewPathError) {
      return NextResponse.json(
        { status: "invalid-path", message: cause.message },
        { status: 400 },
      );
    }
    // A dev-only message is fine here — this route is already inert
    // outside development (see the `isThemePreviewEnabled` check above),
    // so there is no ordinary-user audience to protect from a stack
    // trace/path detail the way `theme-loader.ts`'s userMessage is.
    const message = cause instanceof Error ? cause.message : String(cause);
    return NextResponse.json(
      { status: "read-failed", message },
      { status: 404 },
    );
  }
}
