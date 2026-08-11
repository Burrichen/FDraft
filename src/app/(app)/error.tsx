"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="border-border flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <AlertTriangle aria-hidden="true" className="text-destructive size-8" />
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">
          Something went wrong
        </p>
        <p className="text-muted-foreground max-w-sm text-sm">
          {error.message || "An unexpected error occurred loading this page."}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
