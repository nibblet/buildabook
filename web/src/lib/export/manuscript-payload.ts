import { getManuscriptChapters } from "@/lib/manuscript";
import { loadSpine } from "@/lib/spine";
import type { Chapter, Scene } from "@/lib/supabase/types";

export type ManuscriptExportScene = Pick<
  Scene,
  "id" | "title" | "content" | "wordcount" | "order_index"
>;

export type ManuscriptExportChapter = Pick<
  Chapter,
  "id" | "title" | "order_index"
> & {
  scenes: ManuscriptExportScene[];
};

/** Same ordering as the manuscript reader: spine chapters in order, scenes sorted per chapter. */
export async function loadManuscriptExportData(
  projectId: string,
  chapterIdFilter: string | null,
): Promise<{ chapters: ManuscriptExportChapter[] }> {
  const spine = await loadSpine(projectId);
  const rows = getManuscriptChapters(spine, chapterIdFilter);
  const chapters: ManuscriptExportChapter[] = rows.map((c) => ({
    id: c.id,
    title: c.title,
    order_index: c.order_index,
    scenes: c.scenes.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
      wordcount: s.wordcount,
      order_index: s.order_index,
    })),
  }));
  return { chapters };
}
