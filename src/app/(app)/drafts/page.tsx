"use client";

import { CheckCircle2, Clapperboard } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { DraftLifecycleView } from "@/components/drafts/draft-lifecycle-view";
import { Button } from "@/components/ui/button";

/**
 * Local-first rewrite of the Active Draft page (see docs/product-spec.md,
 * "FULL OFFLINE CORE FUNCTIONALITY", Prompt 9.5B) — now a thin wrapper
 * around the shared `DraftLifecycleView` (see docs/updates, "PROMPT B2.1 —
 * DUAL DRAFT ARCHITECTURE"), scoped to the profile's normal Draft
 * (`sourceEventId: null`). An event's own Draft (e.g. Halloween) is a
 * completely independent slot, shown on that event's own page instead —
 * never here, and never the other way around.
 */
export default function DraftsPage() {
  const searchParams = useSearchParams();
  const challengeWarning = searchParams.get("challengeWarning");
  const [justArchived, setJustArchived] = useState(false);

  return (
    <DraftLifecycleView
      sourceEventId={null}
      challengeWarning={challengeWarning}
      onDraftArchived={() => setJustArchived(true)}
      justArchivedBanner={
        justArchived ? (
          <div className="border-watchlist-green/40 bg-watchlist-green/10 text-foreground flex items-center gap-2 rounded-lg border px-4 py-3 text-sm">
            <CheckCircle2
              aria-hidden="true"
              className="text-watchlist-green size-4 shrink-0"
            />
            Draft complete — nice work! See it in your{" "}
            <Link
              href="/drafts/history"
              className="underline underline-offset-2"
            >
              draft history
            </Link>
            .
          </div>
        ) : null
      }
      emptyState={
        <div className="space-y-6">
          <div>
            <h1 className="page-heading">Active draft</h1>
            <p className="page-subtitle">
              A temporary watchlist challenge for a defined period.
            </p>
          </div>
          <EmptyState
            icon={Clapperboard}
            title="No active draft"
            description="Pick a difficulty, choose how the list is built, and take on a Monthly Watchlist Draft."
            action={
              <Button nativeButton={false} render={<Link href="/drafts/new" />}>
                Start a draft
              </Button>
            }
          />
        </div>
      }
    />
  );
}
