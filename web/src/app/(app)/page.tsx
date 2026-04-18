import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Sparkles, ArrowRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressRing } from "@/components/progress-ring";
import { getOrCreateProject, isOnboarded } from "@/lib/projects";
import {
  currentBeatFor,
  currentChapterFor,
  loadSpine,
  pickCurrentScene,
} from "@/lib/spine";
import { supabaseServer } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";
import { envIsConfigured } from "@/lib/env";
import { CraftTerm } from "@/components/craft-term";
import { ChemistryStrip } from "@/components/chemistry-strip";
import { WarmupPromptCard } from "@/components/warmup-prompt";
import { loadPrimaryRelationshipChemistry } from "@/lib/dashboard/chemistry";
import { buildNextActions } from "@/lib/dashboard/next-actions";
import { SessionContinuitySection } from "./session-continuity";
import type { OpenThread, WritingSession } from "@/lib/supabase/types";

function buildNarrativeFrame(
  words: number,
  target: number,
  beatsCovered: number,
  totalBeats: number,
  act: number,
): string {
  const pct = Math.round((words / (target || 30000)) * 100);
  const actLabel = act === 1 ? "Act 1" : act === 2 ? "Act 2" : "Act 3";

  if (pct === 0) return "Your story is waiting to begin.";

  const position =
    pct < 10
      ? "just getting started"
      : pct < 25
        ? "early in"
        : pct < 40
          ? "about a third of the way through"
          : pct < 60
            ? "at the midpoint of"
            : pct < 75
              ? "well into"
              : pct < 90
                ? "nearing the end of"
                : "almost finished with";

  const beatLine =
    beatsCovered === 0
      ? "No beats covered yet."
      : beatsCovered === totalBeats
        ? "All beats covered."
        : `${beatsCovered} of ${totalBeats} beats covered.`;

  return `You're ${position} ${actLabel}. ${beatLine}`;
}

export default async function DashboardPage() {
  if (!envIsConfigured()) {
    return null; // AuthedLayout renders the setup screen
  }
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const onboarded = await isOnboarded(project.id);
  if (!onboarded) redirect("/onboarding");

  const supabase = await supabaseServer();

  const [
    spine,
    sessionsRes,
    threadsRes,
    charCountRes,
    relCountRes,
    chem,
  ] = await Promise.all([
    loadSpine(project.id),
    supabase
      .from("sessions")
      .select("*")
      .eq("project_id", project.id)
      .order("ended_at", { ascending: false })
      .limit(12),
    supabase
      .from("open_threads")
      .select("*")
      .eq("project_id", project.id)
      .eq("resolved", false)
      .order("created_at", { ascending: true })
      .limit(6),
    supabase
      .from("characters")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id),
    supabase
      .from("relationships")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id),
    loadPrimaryRelationshipChemistry(project.id),
  ]);

  const recentSessions = (sessionsRes.data ?? []) as WritingSession[];
  const lastSession = recentSessions[0] ?? null;
  const threads = threadsRes.data ?? [];

  const characterCount = charCountRes.count ?? 0;
  const relationshipCount = relCountRes.count ?? 0;

  const currentScene = pickCurrentScene(spine);
  const currentChapter = currentChapterFor(spine, currentScene);
  const currentBeat = currentBeatFor(spine, currentScene, currentChapter);

  const beatsCovered = spine.beats.filter(
    (b) => b.coverage !== "empty",
  ).length;
  const wordPct = Math.min(
    100,
    Math.round(
      (spine.totalWordcount / (project.target_wordcount || 30000)) * 100,
    ),
  );

  const sceneCounts = spine.scenes.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    { planned: 0, drafting: 0, done: 0 } as Record<string, number>,
  );

  const narrativeFrame = buildNarrativeFrame(
    spine.totalWordcount,
    project.target_wordcount,
    beatsCovered,
    spine.beats.length,
    currentBeat?.act ?? 1,
  );

  const nextActions = buildNextActions(spine, currentBeat?.id ?? null, {
    characterCount,
    relationshipCount,
    staleThreads: (threads as OpenThread[]).map((t) => ({
      id: t.id,
      question: t.question,
      created_at: t.created_at,
      opened_in_scene_id: t.opened_in_scene_id,
    })),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8 animate-in fade-in duration-300">
      <header className="flex items-center justify-between">
        <div>
          <p className="label-eyebrow mb-1">Your story</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            {project.title}
          </h1>
        </div>
        <Link href="/project/settings">
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </Button>
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 label-eyebrow">
              <BookOpen className="h-3.5 w-3.5" /> Where you are
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentBeat && (
              <div>
                <p className="label-eyebrow mb-1">
                  <CraftTerm slug="beat">Current beat</CraftTerm>
                </p>
                <p className="font-serif text-xl font-semibold leading-tight">
                  {currentBeat.title}
                </p>
              </div>
            )}
            {currentChapter && (
              <div className="text-sm text-muted-foreground">
                {currentChapter.title ||
                  `Chapter ${currentChapter.order_index ?? "—"}`}
              </div>
            )}
            <div className="pt-1">
              {currentScene ? (
                <Link href={`/scenes/${currentScene.id}`}>
                  <Button className="gap-2">
                    Continue where you left off <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : currentChapter ? (
                <Link href={`/chapters/${currentChapter.id}`}>
                  <Button className="gap-2">
                    Open chapter <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="label-eyebrow">Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <ProgressRing pct={wordPct} size={72} />
              <div className="space-y-0.5">
                <p className="text-sm font-medium tabular-nums">
                  {formatNumber(spine.totalWordcount)}{" "}
                  <span className="font-normal text-muted-foreground">
                    / {formatNumber(project.target_wordcount)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">words written</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {narrativeFrame}
            </p>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Beats covered</span>
                <span className="font-medium tabular-nums text-foreground">
                  {beatsCovered} / {spine.beats.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Scenes</span>
                <span className="font-medium tabular-nums text-foreground">
                  {sceneCounts.drafting} drafting · {sceneCounts.done} done
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <WarmupPromptCard />
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Chemistry arc
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChemistryStrip points={chem.points} />
          </CardContent>
        </Card>
      </section>

      <SessionContinuitySection spine={spine} lastSession={lastSession} />

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" /> What&apos;s next
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {nextActions.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className="group flex items-center justify-between rounded-md border bg-background px-4 py-3 text-sm [transition:background-color_180ms_cubic-bezier(0.2,0,0,1),box-shadow_180ms_cubic-bezier(0.2,0,0,1)] hover:bg-accent hover:shadow-sm"
              >
                <span>{a.label}</span>
                <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      {threads.length > 0 && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Open threads
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {threads.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex items-start gap-2">
                    <Badge variant="muted" className="mt-0.5">
                      ?
                    </Badge>
                    <p className="leading-snug">{t.question}</p>
                  </div>
                  {t.opened_in_scene_id && (
                    <Link
                      href={`/scenes/${t.opened_in_scene_id}`}
                      className="shrink-0 text-xs text-primary hover:underline sm:ml-2"
                    >
                      Open scene
                    </Link>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
