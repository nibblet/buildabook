import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Dashboard
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            {project.title}
          </h1>
        </div>
        <Link href="/project/settings">
          <Button variant="ghost" size="sm">
            Settings
          </Button>
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" /> Where you are
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentBeat && (
              <div className="text-sm">
                <span className="text-muted-foreground">
                  <CraftTerm slug="beat">Current beat</CraftTerm>:
                </span>{" "}
                <span className="font-medium">{currentBeat.title}</span>
              </div>
            )}
            {currentChapter && (
              <div className="text-sm">
                <span className="text-muted-foreground">Current chapter:</span>{" "}
                <span className="font-medium">
                  {currentChapter.title ||
                    `Chapter ${currentChapter.order_index ?? "—"}`}
                </span>
              </div>
            )}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Words</span>
                <span className="font-medium tabular-nums">
                  {formatNumber(spine.totalWordcount)} /{" "}
                  {formatNumber(project.target_wordcount)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${wordPct}%` }}
                />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Beats covered</span>
              <span className="font-medium tabular-nums">
                {beatsCovered} / {spine.beats.length}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Scenes</span>
              <span className="font-medium tabular-nums">
                {sceneCounts.drafting} drafting · {sceneCounts.done} done
              </span>
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
                className="group flex items-center justify-between rounded-md border bg-background px-4 py-3 text-sm transition-colors hover:bg-accent"
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
