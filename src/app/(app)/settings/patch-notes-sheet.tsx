"use client";

import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PATCH_NOTES } from "@/domain/updates/patch-notes";

/**
 * The Settings → Updates "Patch notes" viewer (see docs/updates, "PATCH
 * NOTES IN SETTINGS") — reads from the single versioned `PATCH_NOTES`
 * data source, never a hand-written JSX list, so it can't drift from the
 * repository-level `PATCH_NOTES.md`. Rendered as a `Sheet` (a drawer, not
 * a full route) so it works the same on mobile and desktop and doesn't
 * need its own page.
 */
export function PatchNotesSheet() {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <ScrollText aria-hidden="true" />
            Patch notes
          </Button>
        }
      />
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Patch notes</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
          {PATCH_NOTES.map((entry) => (
            <div key={entry.version} className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-foreground text-base font-semibold">
                  v{entry.version}
                </h2>
                <Badge variant="secondary">{entry.nickname}</Badge>
              </div>
              {entry.sections.map((section) => (
                <div key={section.heading} className="space-y-1">
                  <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    {section.heading}
                  </h3>
                  <ul className="text-foreground list-disc space-y-1 pl-4 text-sm">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
