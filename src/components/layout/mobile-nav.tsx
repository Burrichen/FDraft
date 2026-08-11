"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavLinks } from "./nav-links";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu aria-hidden="true" />
          </Button>
        }
      />
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>FDraft</SheetTitle>
        </SheetHeader>
        <NavLinks
          className="flex flex-col gap-1 px-2"
          linkClassName="text-base py-2.5"
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
