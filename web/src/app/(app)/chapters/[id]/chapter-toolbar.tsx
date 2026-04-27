"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChapterDebrief } from "@/lib/ai/chapter-debrief";
import type { FactCheckWarning } from "@/lib/supabase/types";
import {
  runChapterDebriefAction,
  runChapterFactCheckAction,
} from "../actions";

export function ChapterChapterToolbar({
  chapterId,
  initialWarnings,
}: {
  chapterId: string;
  initialWarnings: FactCheckWarning[] | null | undefined;
}) {
  const router = useRouter();
  const [warnings, setWarnings] = useState<FactCheckWarning[]>(
    Array.isArray(initialWarnings) ? initialWarnings : [],
  );
  const [debrief, setDebrief] = useState<ChapterDebrief | null>(null);
  const [isFactChecking, setIsFactChecking] = useState(false);
  const [isDebriefing, setIsDebriefing] = useState(false);

  async function factCheck() {
    if (isFactChecking) return;
    setIsFactChecking(true);
    try {
      const res = await runChapterFactCheckAction(chapterId);
      if (res.ok && res.warnings) setWarnings(res.warnings);
      router.refresh();
    } finally {
      setIsFactChecking(false);
    }
  }

  async function runDebrief() {
    if (isDebriefing) return;
    setIsDebriefing(true);
    try {
      const res = await runChapterDebriefAction(chapterId);
      if (res.ok && res.debrief) setDebrief(res.debrief);
      router.refresh();
    } finally {
      setIsDebriefing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Chapter review (Phase 2)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" asChild>
            <Link href={`/chapters/${chapterId}/codex-review`}>
              Review codex
            </Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={factCheck}
            disabled={isFactChecking}
          >
            {isFactChecking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running continuity check...
              </>
            ) : (
              "Run continuity check"
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={runDebrief}
            disabled={isDebriefing}
          >
            {isDebriefing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running debrief...
              </>
            ) : (
              "Chapter debrief"
            )}
          </Button>
        </div>

        {warnings.length > 0 && (
          <ul className="space-y-2 text-sm">
            {warnings.map((w, i) => (
              <li
                key={i}
                className={
                  w.severity === "warn"
                    ? "rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30"
                    : "rounded-md border bg-muted/40 px-3 py-2"
                }
              >
                {w.message}
              </li>
            ))}
          </ul>
        )}

        {debrief && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
            <p className="font-medium text-foreground">{debrief.summary}</p>

            {debrief.goingWell.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  What&apos;s going well
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {debrief.goingWell.map((item, idx) => (
                    <li key={`good-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {debrief.couldBeImproved.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  What could be improved
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {debrief.couldBeImproved.map((item, idx) => (
                    <li key={`improve-${idx}`}>{item}</li>
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
