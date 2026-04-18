import { stripHtml } from "@/lib/html";
import { supabaseServer } from "@/lib/supabase/server";
import type { Character, WorldElement } from "@/lib/supabase/types";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Recompute character mention totals for one chapter from all scene HTML in that chapter. */
export async function recountChapterCharacterMentions(
  chapterId: string,
): Promise<void> {
  const supabase = await supabaseServer();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", chapterId)
    .maybeSingle();
  if (!chapter?.project_id) return;

  const [{ data: chars }, { data: scenes }] = await Promise.all([
    supabase
      .from("characters")
      .select("*")
      .eq("project_id", chapter.project_id),
    supabase
      .from("scenes")
      .select("content")
      .eq("chapter_id", chapterId),
  ]);

  const combined = ((scenes ?? []) as { content: string | null }[])
    .map((s) => stripHtml(s.content ?? ""))
    .join("\n\n");

  for (const c of (chars ?? []) as Character[]) {
    const name = c.name?.trim();
    if (!name) continue;
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "gi");
    const matches = combined.match(re);
    const mentionCount = matches?.length ?? 0;

    if (mentionCount === 0) {
      await supabase
        .from("character_mentions")
        .delete()
        .eq("character_id", c.id)
        .eq("chapter_id", chapterId);
    } else {
      await supabase.from("character_mentions").upsert(
        {
          character_id: c.id,
          chapter_id: chapterId,
          scene_id: null,
          mention_count: mentionCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "character_id,chapter_id" },
      );
    }

  }
}

/** Roll up world element name hits per chapter (simple exact phrase count). */
export async function recountChapterElementMentions(
  chapterId: string,
): Promise<void> {
  const supabase = await supabaseServer();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", chapterId)
    .maybeSingle();
  if (!chapter?.project_id) return;

  const [{ data: world }, { data: scenes }] = await Promise.all([
    supabase
      .from("world_elements")
      .select("*")
      .eq("project_id", chapter.project_id),
    supabase
      .from("scenes")
      .select("content")
      .eq("chapter_id", chapterId),
  ]);

  const combined = ((scenes ?? []) as { content: string | null }[])
    .map((s) => stripHtml(s.content ?? ""))
    .join("\n\n");

  for (const w of (world ?? []) as WorldElement[]) {
    const term = w.name?.trim();
    if (!term || term.length < 2) continue;
    const re = new RegExp(`\\b${escapeRegex(term)}\\b`, "gi");
    const matches = combined.match(re);
    const mentionCount = matches?.length ?? 0;

    if (mentionCount === 0) {
      await supabase
        .from("element_mentions")
        .delete()
        .eq("element_id", w.id)
        .eq("chapter_id", chapterId);
    } else {
      await supabase.from("element_mentions").upsert(
        {
          element_id: w.id,
          chapter_id: chapterId,
          scene_id: null,
          mention_count: mentionCount,
        },
        { onConflict: "element_id,chapter_id" },
      );
    }
  }
}
