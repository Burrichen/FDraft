"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function RootError({
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
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <AlertTriangle aria-hidden="true" className="text-destructive size-8" />
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">
          Something went wrong
        </p>
        <p className="text-muted-foreground max-w-sm text-sm">
          {error.message || "An unexpected error occurred."}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
