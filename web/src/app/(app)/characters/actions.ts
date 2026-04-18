"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
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
) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("characters")
    .update(fields)
    .eq("id", characterId);
  if (error) throw error;
  revalidatePath("/characters");
  revalidatePath(`/characters/${characterId}`);
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
