"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useProfileContext } from "@/components/profiles/profile-provider";
import {
  defaultPagePath,
  resolveDefaultPage,
} from "@/domain/profiles/default-page";

/**
 * Root routing (see docs/product-spec.md, "ROOT ROUTING"): "/" opens
 * whichever page the active profile's "Default page" setting names
 * (Settings -> "DEFAULT START PAGE SETTING"), falling back to Watchlist
 * when that setting is missing or invalid. Every OTHER route is
 * completely untouched by this — a direct link to `/drafts/history`
 * still opens History regardless of what the default is, since this
 * component is only ever reached by actually landing on `/` itself.
 *
 * Lives inside the `(app)` route group (mapping to the same `/` URL a
 * bare `src/app/page.tsx` would, since route groups add no URL segment)
 * specifically so it renders under `AppShell`/`ProfileProvider` — the
 * setting lives on the active profile in IndexedDB, which only exists in
 * the browser (see docs/product-spec.md, "FULL OFFLINE CORE
 * FUNCTIONALITY"), so there is no server-side profile to read, and this
 * needs a real `useProfileContext()`. `AppShellContent` only ever renders
 * this page once `activeProfile` is a real, resolved profile
 * (loading/first-run/picker are its own earlier branches), so by the time
 * this effect runs, `activeProfile` is never still `undefined`/`null` in
 * practice; switching profiles while sitting on "/" re-runs this with the
 * new profile's own setting, exactly per "MULTIPLE LOCAL PROFILES":
 * "Switching profile must use that profile's setting the next time the
 * root/home routing behaviour is invoked."
 */
export default function RootPage() {
  const router = useRouter();
  const { activeProfile } = useProfileContext();

  useEffect(() => {
    if (!activeProfile) return;
    const page = resolveDefaultPage(activeProfile.settings.defaultPage);
    router.replace(defaultPagePath(page));
  }, [activeProfile, router]);

  return null;
}
