"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rebuildSceneChunks } from "@/lib/ai/scene-chunks";
import { replaceCharacterNameInHtml } from "@/lib/characters/replace-name-in-prose";
import {
  recountChapterCharacterMentions,
  recountChapterElementMentions,
} from "@/lib/mentions/chapter-mentions";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { countWords } from "@/lib/utils";
import {
  applyMentionBackfill,
  buildMentionReplacements,
} from "@/lib/mentions/character-mention-backfill";

export async function createCharacterDraft() {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("characters")
    .insert({
      project_id: project.id,
      name: "New character",
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/characters");
  redirect(`/characters/${data.id}`);
}

export async function updateCharacter(
  characterId: string,
  fields: {
    name: string;
    role?: string | null;
    species?: string | null;
    archetype?: string | null;
    appearance?: string | null;
    backstory?: string | null;
    wound?: string | null;
    desire?: string | null;
    need?: string | null;
    voice_notes?: string | null;
    powers?: string | null;
    aliases?: string[];
  },
  options?: { replaceNameInProse?: boolean },
): Promise<{ proseScenesUpdated: number; proseReplacements: number }> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");

  const supabase = await supabaseServer();
  const { data: row } = await supabase
    .from("characters")
    .select("id, name, project_id")
    .eq("id", characterId)
    .maybeSingle();

  if (!row || row.project_id !== project.id) {
    throw new Error("Character not found.");
  }

  const newName = fields.name.trim() || "Untitled";
  const previousName = String(row.name ?? "").trim();
  let proseScenesUpdated = 0;
  let proseReplacements = 0;
  const proseTouchedScenes: string[] = [];
  const proseTouchedChapters = new Set<string>();

  const shouldReplaceProse =
    Boolean(options?.replaceNameInProse) &&
    previousName.length > 0 &&
    previousName !== newName;

  if (shouldReplaceProse) {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id")
      .eq("project_id", project.id);
    const chapterIds = (chapters ?? []).map((c) => c.id);
    if (chapterIds.length > 0) {
      const { data: scenes } = await supabase
        .from("scenes")
        .select("id, content, chapter_id")
        .in("chapter_id", chapterIds);

      for (const scene of scenes ?? []) {
        const current = String(scene.content ?? "");
        const { html: nextHtml, replacements } = replaceCharacterNameInHtml(
          current,
          previousName,
          newName,
        );
        if (replacements === 0 || nextHtml === current) continue;

        proseReplacements += replacements;
        proseScenesUpdated += 1;
        proseTouchedScenes.push(scene.id);
        proseTouchedChapters.add(scene.chapter_id);

        const words = countWords(nextHtml);
        await supabase
          .from("scenes")
          .update({
            content: nextHtml,
            wordcount: words,
            updated_at: new Date().toISOString(),
          })
          .eq("id", scene.id);

        await rebuildSceneChunks(scene.id);
      }

      for (const cid of proseTouchedChapters) {
        await recountChapterCharacterMentions(cid);
        await recountChapterElementMentions(cid);
      }
    }
  }

  const { error } = await supabase
    .from("characters")
    .update(fields)
    .eq("id", characterId);
  if (error) throw error;

  revalidatePath("/characters");
  revalidatePath(`/characters/${characterId}`);
  if (proseScenesUpdated > 0) {
    revalidatePath("/manuscript");
    revalidatePath("/spine");
    revalidatePath("/");
    for (const id of proseTouchedScenes) {
      revalidatePath(`/scenes/${id}`);
    }
    for (const cid of proseTouchedChapters) {
      revalidatePath(`/chapters/${cid}`);
    }
  }

  return { proseScenesUpdated, proseReplacements };
}

export async function deleteCharacter(characterId: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("characters")
    .delete()
    .eq("id", characterId);
  if (error) throw error;
  revalidatePath("/characters");
  redirect("/characters");
}

export async function backfillCharacterMentions() {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();

  const [{ data: chars }, { data: chapters }] = await Promise.all([
    supabase.from("characters").select("name, aliases").eq("project_id", project.id),
    supabase.from("chapters").select("id").eq("project_id", project.id),
  ]);

  const replacements = buildMentionReplacements(
    (chars ?? []) as { name: string; aliases: string[] | null }[],
  );
  if (replacements.length === 0) return;

  const chapterIds = (chapters ?? []).map((c) => c.id);
  if (chapterIds.length === 0) return;

  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, content")
    .in("chapter_id", chapterIds);

  for (const scene of scenes ?? []) {
    const current = String(scene.content ?? "");
    if (!current.trim()) continue;
    const { content, changed } = applyMentionBackfill(current, replacements);
    if (!changed || content === current) continue;
    await supabase
      .from("scenes")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", scene.id);
  }

  revalidatePath("/characters");
  revalidatePath("/spine");
  revalidatePath("/");
}
