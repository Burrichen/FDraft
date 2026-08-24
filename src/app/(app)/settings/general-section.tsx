"use client";

import { Card, CardContent } from "@/components/ui/card";
import { DefaultPageSection } from "./default-page-section";
import { FranchiseOrderSection } from "./franchise-order-section";

/**
 * "GENERAL" (see docs/updates, "SETTINGS INFORMATION ARCHITECTURE
 * REBUILD" §2) — ordinary application/drafting behaviour that doesn't
 * belong to a more specific section. Both rows share one card rather than
 * each getting its own (§13: "Avoid making every single setting its own
 * enormous card") — deliberately just these two; Event testing and
 * metadata tools belong in Developer and Watchlist & Metadata
 * respectively, never here.
 */
export function GeneralSection() {
  return (
    <Card>
      <CardContent className="space-y-4">
        <DefaultPageSection />
        <div className="border-t pt-4">
          <FranchiseOrderSection />
        </div>
      </CardContent>
    </Card>
  );
}
