"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [debriefText, setDebriefText] = useState<string | null>(null);
  const [, start] = useTransition();

  function factCheck() {
    start(async () => {
      const res = await runChapterFactCheckAction(chapterId);
      if (res.ok && res.warnings) setWarnings(res.warnings);
      router.refresh();
    });
  }

  function runDebrief() {
    start(async () => {
      const res = await runChapterDebriefAction(chapterId);
      if (res.ok && res.text) setDebriefText(res.text);
      router.refresh();
    });
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
          <Button type="button" size="sm" variant="secondary" onClick={factCheck}>
            Run continuity check
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={runDebrief}>
            Chapter debrief
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

        {debriefText && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
            {debriefText}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
