import type { SpineChapter, SpineData } from "@/lib/spine";

/** Chapters (and scenes per chapter) in book order — same as `loadSpine` output after per-chapter scene sort. */
export function getManuscriptChapters(
  spine: SpineData,
  chapterIdFilter: string | null,
): SpineChapter[] {
  if (!chapterIdFilter?.trim()) return spine.chapters;
  return spine.chapters.filter((c) => c.id === chapterIdFilter);
}
