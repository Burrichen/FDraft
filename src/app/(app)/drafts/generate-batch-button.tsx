"use client";

import { useActionState, useEffect, useRef } from "react";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import { generateBatchAction, type GenerateBatchActionState } from "./actions";

const INITIAL_STATE: GenerateBatchActionState = { error: null };

export function GenerateBatchButton({
  draftId,
  batchSize,
  onGenerated,
}: {
  draftId: string;
  batchSize: number;
  onGenerated: () => void;
}) {
  const { activeProfile, repositories } = useProfileContext();
  const [state, formAction, isPending] = useActionState(
    (prevState: GenerateBatchActionState, formData: FormData) =>
      generateBatchAction(
        { repositories, profileId: activeProfile!.id },
        prevState,
        formData,
      ),
    INITIAL_STATE,
  );
  const handledPendingState = useRef(isPending);

  useEffect(() => {
    // Fires once, right as a pending submission resolves successfully —
    // this is the local-first replacement for the old Server Action's
    // `revalidatePath("/drafts")`: nothing re-fetches automatically here,
    // so the parent page's data must be told to reload explicitly.
    if (handledPendingState.current && !isPending && !state.error) {
      onGenerated();
    }
    handledPendingState.current = isPending;
  }, [isPending, state.error, onGenerated]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="draftId" value={draftId} />
      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? "Generating…" : `Generate ${batchSize} more`}
      </Button>
      {state.error ? (
        <p className="text-destructive text-sm">{state.error}</p>
      ) : null}
    </form>
  );
}
