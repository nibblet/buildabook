import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { StartChapterForBeat } from "./start-chapter-for-beat";
import type { Beat, Chapter } from "@/lib/supabase/types";

export default async function BeatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getOrCreateProject();
  if (!project) redirect("/login");
  const supabase = await supabaseServer();
  const { data: beat } = await supabase
    .from("beats")
    .select("*")
    .eq("id", id)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!beat) notFound();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("*")
    .eq("project_id", project.id)
    .order("order_index");
  const linked = ((chapters ?? []) as Chapter[]).filter((c) =>
    (c.beat_ids ?? []).includes((beat as Beat).id),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Act {(beat as Beat).act} · Beat {(beat as Beat).order_index}
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          {(beat as Beat).title}
        </h1>
        {(beat as Beat).description && (
          <p className="max-w-prose text-muted-foreground">
            {(beat as Beat).description}
          </p>
        )}
      </header>

      {(beat as Beat).why_it_matters && (
        <Card className="border-amber-300/40 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
              <Lightbulb className="h-4 w-4" /> Why this beat matters
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-amber-950 dark:text-amber-100">
            {(beat as Beat).why_it_matters}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Linked chapters
        </h2>
        {linked.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
              <p>No chapters are covering this beat yet.</p>
              <StartChapterForBeat
                projectId={project.id}
                beatId={(beat as Beat).id}
              />
            </CardContent>
          </Card>
        )}
        {linked.map((c) => (
          <Link key={c.id} href={`/chapters/${c.id}`}>
            <Card className="transition-colors hover:border-foreground/20">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <div className="text-sm font-medium">
                    {c.title || `Chapter ${(c.order_index ?? 0) + 1}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.wordcount ?? 0} words ·{" "}
                    <Badge variant="muted">{c.status}</Badge>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 opacity-40" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section className="border-t pt-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Ask the Profiler about this beat
        </h2>
        <Link href={`/chapters/${linked[0]?.id ?? ""}`}>
          <Button variant="outline" size="sm" disabled={!linked[0]}>
            Open the chapter covering this beat
          </Button>
        </Link>
      </section>
    </div>
  );
}
