"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ChapterDebrief } from "@/lib/ai/chapter-debrief";
import type { FactCheckWarning } from "@/lib/supabase/types";
import {
  runChapterDebriefAction,
  runChapterFactCheckAction,
} from "../actions";
import { runChapterFlowWindowAction } from "@/app/(app)/flow-actions";
import type { ChapterFlowWindow } from "@/lib/ai/chapter-flow-window";
import type { FlowWindowMode } from "@/lib/ai/flow-outline-serialize";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteChapterButton } from "./delete-chapter-button";

const STORAGE_EXPANDED = "bab:chapter-review-expanded";

export function ChapterChapterToolbar({
  chapterId,
  chapterTitle,
  sceneCount,
  initialWarnings,
}: {
  chapterId: string;
  chapterTitle: string | null;
  sceneCount: number;
  initialWarnings: FactCheckWarning[] | null | undefined;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [warnings, setWarnings] = useState<FactCheckWarning[]>(
    Array.isArray(initialWarnings) ? initialWarnings : [],
  );
  const [debrief, setDebrief] = useState<ChapterDebrief | null>(null);
  const [flowResult, setFlowResult] = useState<ChapterFlowWindow | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [flowMode, setFlowMode] =
    useState<FlowWindowMode>("chapter_with_neighbors");
  const [isFlowChecking, setIsFlowChecking] = useState(false);
  const [isFactChecking, setIsFactChecking] = useState(false);
  const [isDebriefing, setIsDebriefing] = useState(false);
  /** True after a continuity run completed with zero warnings (session-local until refresh). */
  const [continuityCleanRun, setContinuityCleanRun] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_EXPANDED);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate outline prefs after SSR (matches NovelSpine pattern)
      if (v === "0") setExpanded(false);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setFlowResult(null);
    setFlowError(null);
  }, [chapterId]);

  function setExpandedPersist(next: boolean) {
    setExpanded(next);
    try {
      localStorage.setItem(STORAGE_EXPANDED, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  async function factCheck() {
    if (isFactChecking) return;
    setIsFactChecking(true);
    try {
      const res = await runChapterFactCheckAction(chapterId);
      if (res.ok) {
        const next = res.warnings ?? [];
        setWarnings(next);
        setContinuityCleanRun(next.length === 0);
      } else {
        setContinuityCleanRun(false);
      }
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

  async function runFlowCheck() {
    if (isFlowChecking) return;
    setIsFlowChecking(true);
    setFlowError(null);
    try {
      const res = await runChapterFlowWindowAction(chapterId, {
        mode: flowMode,
      });
      if (res.ok && res.result) setFlowResult(res.result);
      else setFlowError(res.error ?? "Flow check failed.");
      router.refresh();
    } finally {
      setIsFlowChecking(false);
    }
  }

  const collapsedHint =
    warnings.length > 0
      ? `${warnings.length} continuity note${warnings.length === 1 ? "" : "s"}`
      : debrief
        ? "Debrief on file — expand to read"
        : "Codex, continuity, debrief — chapter-level actions";

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-md text-left outline-none ring-offset-background transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-expanded={expanded}
          onClick={() => setExpandedPersist(!expanded)}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-sm text-muted-foreground">
              Chapter review (Phase 2)
            </CardTitle>
            {!expanded && (
              <p className="text-xs text-muted-foreground">{collapsedHint}</p>
            )}
          </div>
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Select
              value={flowMode}
              onValueChange={(v) =>
                setFlowMode(v as FlowWindowMode)
              }
            >
              <SelectTrigger className="w-full sm:w-[260px]">
                <SelectValue placeholder="Flow window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chapter">Flow: this chapter only</SelectItem>
                <SelectItem value="chapter_with_neighbors">
                  Flow: chapter + neighbor scenes
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={runFlowCheck}
              disabled={isFlowChecking || sceneCount === 0}
            >
              {isFlowChecking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running flow check…
                </>
              ) : (
                "Flow check"
              )}
            </Button>
          </div>
          {flowError && (
            <p className="text-sm text-destructive">{flowError}</p>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex min-h-[2.25rem]">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full"
                asChild
              >
                <Link href={`/chapters/${chapterId}/codex-review`}>
                  Review codex
                </Link>
              </Button>
            </div>
            <div className="flex min-h-[2.25rem]">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="w-full"
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
            </div>
            <div className="flex min-h-[2.25rem]">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
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
            <div className="flex min-h-[2.25rem]">
              <DeleteChapterButton
                chapterId={chapterId}
                chapterTitle={chapterTitle}
                sceneCount={sceneCount}
                className="w-full border-destructive/40"
              />
            </div>
          </div>

          {warnings.length === 0 && continuityCleanRun && (
            <p className="rounded-md border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              No continuity issues detected.
            </p>
          )}

          {warnings.length === 0 && !continuityCleanRun && (
            <p className="text-xs text-muted-foreground">
              Run continuity check to compare this chapter&apos;s scenes against your codex and cast.
            </p>
          )}

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

          {flowResult && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Flow check (scene cards)
              </p>
              <p className="mt-1 font-medium text-foreground">
                {flowResult.summary}
              </p>
              {flowResult.local_concerns.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Local sequence
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                    {flowResult.local_concerns.map((c, idx) => (
                      <li key={`fl-${idx}`}>{c.note}</li>
                    ))}
                  </ul>
                </div>
              )}
              {flowResult.boundary_notes.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                    Boundaries
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                    {flowResult.boundary_notes.map((note, idx) => (
                      <li key={`bn-${idx}`}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
              {flowResult.reorder_hypotheses.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Reorder / bridges
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                    {flowResult.reorder_hypotheses.map((r, idx) => (
                      <li key={`rh-${idx}`}>{r.note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
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
      )}
    </Card>
  );
}
