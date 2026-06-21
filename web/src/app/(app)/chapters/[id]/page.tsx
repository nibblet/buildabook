import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabaseServer } from "@/lib/supabase/server";
import { getActiveProject } from "@/lib/projects";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AddSceneButton } from "./add-scene-button";
import { BulkAddScenesButton } from "./bulk-add-scenes-button";
import { ChapterChapterToolbar } from "./chapter-toolbar";
import { ChapterScenesSortable } from "./chapter-scenes-sortable";
import { ChapterTitleInline } from "@/components/chapter-title-inline";
import { ChapterSynopsisInline } from "./chapter-synopsis-inline";
import type {
  Beat,
  Character,
  Chapter,
  FactCheckWarning,
  Scene,
} from "@/lib/supabase/types";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getActiveProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data: chapter } = await supabase
    .from("chapters")
    .select("*")
    .eq("id", id)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!chapter) notFound();

  const [{ data: scenes }, { data: beats }, { data: chars }, { data: allChapters }] =
    await Promise.all([
      supabase
        .from("scenes")
        .select("*")
        .eq("chapter_id", id)
        .order("order_index", { ascending: true }),
      supabase
        .from("beats")
        .select("*")
        .eq("project_id", project.id)
        .order("order_index"),
      supabase.from("characters").select("*").eq("project_id", project.id),
      supabase
        .from("chapters")
        .select("id, title, order_index")
        .eq("project_id", project.id)
        .order("order_index", { ascending: true }),
    ]);

  const otherChapters = ((allChapters ?? []) as Chapter[])
    .filter((c) => c.id !== id)
    .map((c) => ({
      id: c.id,
      title: c.title,
      order_index: c.order_index,
    }));

  const chapterBeats = ((beats ?? []) as Beat[]).filter((b) =>
    (chapter as Chapter).beat_ids?.includes(b.id),
  );

  const totalWords = ((scenes ?? []) as Scene[]).reduce(
    (s, sc) => s + (sc.wordcount ?? 0),
    0,
  );

  const warningsRaw = (chapter as Chapter & { fact_check_warnings?: unknown })
    .fact_check_warnings;
  const initialWarnings = Array.isArray(warningsRaw)
    ? (warningsRaw as FactCheckWarning[])
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Chapter
            </p>
            <ChapterTitleInline
              chapterId={chapter.id}
              initialTitle={chapter.title}
              placeholder={`Chapter ${(chapter.order_index ?? 0) + 1}`}
              variant="heading"
            />
            <ChapterSynopsisInline
              chapterId={chapter.id}
              initialSynopsis={chapter.synopsis}
            />
          </div>
          <Link
            href={`/manuscript?chapter=${chapter.id}`}
            className="shrink-0 text-sm font-semibold text-amber-800 underline-offset-4 hover:text-amber-950 hover:underline dark:text-amber-200 dark:hover:text-amber-100"
          >
            Read this chapter
          </Link>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Badge variant="muted">Status: {chapter.status}</Badge>
          <span>·</span>
          <span className="tabular-nums">
            {formatNumber(totalWords)} words
          </span>
          {chapterBeats.length > 0 && (
            <>
              <span className="hidden sm:inline">·</span>
              <span className="shrink-0">Beats:</span>
              <div className="flex max-w-full min-w-0 flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                {chapterBeats.map((b) => (
                  <Badge
                    key={b.id}
                    variant="secondary"
                    className="shrink-0 whitespace-nowrap"
                  >
                    {b.title}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      <ChapterChapterToolbar
        chapterId={chapter.id}
        chapterTitle={chapter.title}
        sceneCount={((scenes ?? []) as Scene[]).length}
        initialWarnings={initialWarnings}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Scenes
          </h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/import">Import</Link>
            </Button>
            <BulkAddScenesButton chapterId={chapter.id} />
            <AddSceneButton chapterId={chapter.id} />
          </div>
        </div>

        {((scenes ?? []) as Scene[]).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
              <p className="text-sm">No scenes yet.</p>
              <AddSceneButton chapterId={chapter.id} />
            </CardContent>
          </Card>
        ) : (
          <ChapterScenesSortable
            chapterId={chapter.id}
            scenes={(scenes ?? []) as Scene[]}
            beats={(beats ?? []) as Beat[]}
            characters={(chars ?? []) as Character[]}
            otherChapters={otherChapters}
          />
        )}
      </section>
    </div>
  );
}
