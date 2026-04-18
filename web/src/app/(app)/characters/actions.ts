"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";

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
