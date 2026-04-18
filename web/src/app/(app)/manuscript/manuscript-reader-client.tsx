"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useFocusMode } from "@/hooks/use-focus-mode";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import type { Chapter, Scene } from "@/lib/supabase/types";

export type ManuscriptChapterPayload = {
  chapter: Pick<Chapter, "id" | "title" | "order_index">;
  scenes: Pick<
    Scene,
    "id" | "title" | "content" | "wordcount" | "order_index"
  >[];
};

export function ManuscriptReaderClient({
  chapters,
  totalWords,
  singleChapterMode,
}: {
  chapters: ManuscriptChapterPayload[];
  totalWords: number;
  singleChapterMode: boolean;
}) {
  const { enter, exit } = useFocusMode();

  useEffect(() => {
    enter();
    return () => exit();
  }, [enter, exit]);

  return (
    <div className="focus-vignette relative min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button variant="ghost" size="sm" className="gap-1.5" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          {formatNumber(totalWords)} words
        </span>
      </header>

      <div className="mx-auto max-w-[40rem] px-6 py-10 pb-24 md:px-8">
        <p className="label-eyebrow mb-2 flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5" />
          {singleChapterMode ? "Chapter read-through" : "Manuscript"}
        </p>

        {chapters.length > 1 && (
          <nav
            className="mb-10 flex flex-wrap gap-2 border-b border-border pb-6"
            aria-label="Jump to chapter"
          >
            {chapters.map((row) => (
              <a
                key={row.chapter.id}
                href={`#ch-${row.chapter.id}`}
                className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {chapterHeadingLabel(row.chapter)}
              </a>
            ))}
          </nav>
        )}

        {chapters.map((row) => (
          <section
            key={row.chapter.id}
            id={`ch-${row.chapter.id}`}
            className="scroll-mt-24 pb-16 last:pb-8"
          >
            <h2
              className={cn(
                "mb-10 border-b border-border pb-4 font-serif text-2xl font-semibold tracking-tight md:text-3xl",
              )}
            >
              {chapterHeadingLabel(row.chapter)}
            </h2>

            <div className="space-y-14">
              {row.scenes.map((scene, sceneIdx) => (
                <article
                  key={scene.id}
                  id={`scene-${scene.id}`}
                  className="scroll-mt-28"
                >
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-serif text-lg font-medium text-foreground">
                      {scene.title?.trim() ||
                        `Scene ${(scene.order_index ?? sceneIdx) + 1}`}
                    </h3>
                    <Button variant="link" size="sm" className="h-auto shrink-0 p-0 text-xs" asChild>
                      <Link href={`/scenes/${scene.id}`}>Edit scene</Link>
                    </Button>
                  </div>

                  {scene.content?.trim() ? (
                    <div
                      className="prose-writing [&_a]:text-primary [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: scene.content }}
                    />
                  ) : (
                    <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                      No prose yet.{" "}
                      <Link
                        href={`/scenes/${scene.id}`}
                        className="text-primary underline underline-offset-2"
                      >
                        Open in editor
                      </Link>
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function chapterHeadingLabel(chapter: Pick<Chapter, "title" | "order_index">) {
  return chapter.title?.trim()
    ? chapter.title
    : `Chapter ${(chapter.order_index ?? 0) + 1}`;
}
