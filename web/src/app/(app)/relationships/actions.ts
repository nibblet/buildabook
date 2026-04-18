"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";

export async function createRelationship(formData: FormData) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const charA = String(formData.get("char_a_id") ?? "").trim();
  const charB = String(formData.get("char_b_id") ?? "").trim();
  const type = emptyToNull(formData.get("type"));
  if (!charA || !charB) throw new Error("Pick two characters.");
  if (charA === charB) throw new Error("Choose two different characters.");

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("relationships")
    .insert({
      project_id: project.id,
      char_a_id: charA,
      char_b_id: charB,
      type,
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/relationships");
  redirect(`/relationships/${data.id}`);
}

export async function updateRelationship(
  relationshipId: string,
  fields: {
    char_a_id: string | null;
    char_b_id: string | null;
    type?: string | null;
    current_state?: string | null;
    arc_notes?: string | null;
  },
) {
  const supabase = await supabaseServer();
  if (
    fields.char_a_id &&
    fields.char_b_id &&
    fields.char_a_id === fields.char_b_id
  ) {
    throw new Error("Characters must differ.");
  }
  const { error } = await supabase
    .from("relationships")
    .update(fields)
    .eq("id", relationshipId);
  if (error) throw error;
  revalidatePath("/relationships");
  revalidatePath(`/relationships/${relationshipId}`);
}

export async function deleteRelationship(relationshipId: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("relationships")
    .delete()
    .eq("id", relationshipId);
  if (error) throw error;
  revalidatePath("/relationships");
  redirect("/relationships");
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function confirmRelationshipBeat(beatRowId: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("relationship_beats")
    .update({ approval_status: "confirmed" })
    .eq("id", beatRowId);
  if (error) throw error;
  revalidatePath("/relationships");
  revalidatePath("/");
}

export async function dismissRelationshipBeat(beatRowId: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("relationship_beats")
    .update({ approval_status: "dismissed" })
    .eq("id", beatRowId);
  if (error) throw error;
  revalidatePath("/relationships");
  revalidatePath("/");
}
