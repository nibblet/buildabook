import type { Chapter, Scene } from "@/lib/supabase/types";

export function chapterHeadingLabel(
  chapter: Pick<Chapter, "title" | "order_index">,
): string {
  return chapter.title?.trim()
    ? chapter.title
    : `Chapter ${(chapter.order_index ?? 0) + 1}`;
}

export function sceneHeadingLabel(
  scene: Pick<Scene, "title" | "order_index">,
  sceneIdx: number,
): string {
  return scene.title?.trim()
    ? scene.title
    : `Scene ${(scene.order_index ?? sceneIdx) + 1}`;
}
