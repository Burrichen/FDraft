"use client";

import { Film } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { submitPostmortemResponseAction } from "@/app/(app)/drafts/actions";
import { useProfileContext } from "@/components/profiles/profile-provider";
import { Button } from "@/components/ui/button";
import type { DraftDifficulty, PostmortemResponseType } from "@/repositories";

const RESPONSE_OPTIONS: { id: PostmortemResponseType; label: string }[] = [
  { id: "wanted_more_time", label: "I didn't get time, but I wanted to!" },
  {
    id: "not_interested",
    label: "Actually, I don't think I want to watch this at all",
  },
  { id: "no_reason", label: "I just didn't" },
];

const RESPONSE_LABELS: Record<PostmortemResponseType, string> =
  Object.fromEntries(
    RESPONSE_OPTIONS.map((option) => [option.id, option.label]),
  ) as Record<PostmortemResponseType, string>;

export interface PostmortemItemView {
  draftItemId: string;
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
  /** Already answered (e.g. a previous visit, before a refresh) — the flow must survive refresh. */
  existingResponse: PostmortemResponseType | null;
}

interface PostmortemItemProps {
  draftId: string;
  difficulty: DraftDifficulty;
  film: PostmortemItemView;
  /** Called instead of navigating away when this answer resolves the draft — the parent page (which already has the rest of the draft's data loaded) decides what to do, typically reloading its own data. */
  onArchived?: () => void;
}

/**
 * One film's "Why didn't you watch this?" card (see docs/product-spec.md,
 * "EXPIRY / POST-DRAFT FLOW"). Once answered — whether just now or on a
 * previous visit before a refresh — the three options are replaced with a
 * confirmation instead of staying clickable, so a resubmission is never
 * even offered as an action, on top of the server-side idempotency
 * guarantee in `submit_draft_postmortem_response`.
 */
export function PostmortemItem({
  draftId,
  difficulty,
  film,
  onArchived,
}: PostmortemItemProps) {
  const { activeProfile, repositories } = useProfileContext();
  const [response, setResponse] = useState<PostmortemResponseType | null>(
    film.existingResponse,
  );
  const [isPending, startTransition] = useTransition();
  const [pendingResponse, setPendingResponse] =
    useState<PostmortemResponseType | null>(null);
  const router = useRouter();

  function handleAnswer(choice: PostmortemResponseType) {
    if (!activeProfile) return;
    setPendingResponse(choice);
    startTransition(async () => {
      const result = await submitPostmortemResponseAction(repositories, {
        profileId: activeProfile.id,
        draftId,
        draftItemId: film.draftItemId,
        difficulty,
        response: choice,
      });
      if (!result.ok) {
        toast.error(
          result.error ?? "Could not save your answer. Please try again.",
        );
        setPendingResponse(null);
        return;
      }
      setResponse(choice);
      if (result.draftArchived) {
        if (onArchived) {
          onArchived();
        } else {
          router.push("/drafts?draftArchived=1");
        }
      }
    });
  }

  return (
    <li className="border-border bg-card flex gap-3 rounded-lg border p-3">
      <div className="bg-muted aspect-2/3 w-16 shrink-0 overflow-hidden rounded">
        {film.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- posters are external, remote URLs from third-party providers
          <img
            src={film.posterUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Film aria-hidden="true" className="size-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-foreground truncate text-sm font-medium">
            {film.title}
          </p>
          {film.releaseYear ? (
            <p className="text-muted-foreground text-xs">{film.releaseYear}</p>
          ) : null}
        </div>
        {response ? (
          <p className="text-muted-foreground text-sm">
            You said:{" "}
            <span className="text-foreground">{RESPONSE_LABELS[response]}</span>
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
            {RESPONSE_OPTIONS.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => handleAnswer(option.id)}
                className="justify-start text-left whitespace-normal"
              >
                {isPending && pendingResponse === option.id
                  ? "Saving…"
                  : option.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
