"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { runStorySpineFlowAction } from "@/app/(app)/flow-actions";
import type { StorySpineFlow } from "@/lib/ai/story-spine-flow";

function SceneIdLinks({ ids }: { ids: string[] | undefined }) {
  if (!ids?.length) return null;
  return (
    <span className="ml-1 text-xs text-muted-foreground">
      (
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 ? " · " : ""}
          <Link
            href={`/scenes/${id}`}
            className="font-mono underline underline-offset-2 hover:text-foreground"
            title={id}
          >
            {id.slice(0, 8)}…
          </Link>
        </span>
      ))}
      )
    </span>
  );
}

export function OutlineFlowReview({
  hasOutlineContent,
}: {
  hasOutlineContent: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StorySpineFlow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runStorySpineFlowAction();
      if (res.ok && res.result) setResult(res.result);
      else setError(res.error ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Outline flow review</CardTitle>
        <CardDescription>
          Uses scene cards only (goal, conflict, outcome, beats, POV) — no prose.
          Suggests sequence fixes and pacing across the full book.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!hasOutlineContent || loading}
          onClick={run}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Reviewing outline…
            </>
          ) : (
            "Review outline flow"
          )}
        </Button>
        {!hasOutlineContent && (
          <p className="text-xs text-muted-foreground">
            Add at least one scene to run outline flow review.
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {result && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
            <p className="font-medium text-foreground">{result.summary}</p>

            {result.sequence_concerns.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                  Sequence
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {result.sequence_concerns.map((c, idx) => (
                    <li key={`seq-${idx}`}>
                      {c.note}
                      <SceneIdLinks ids={c.related_scene_ids} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.cross_chapter_transitions.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
                  Chapter transitions
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {result.cross_chapter_transitions.map((t, idx) => (
                    <li key={`xt-${idx}`}>{t.note}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.suggestions.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                  Suggestions
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {result.suggestions.map((s, idx) => (
                    <li key={`sg-${idx}`}>
                      {s.text}
                      <SceneIdLinks ids={s.related_scene_ids} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
