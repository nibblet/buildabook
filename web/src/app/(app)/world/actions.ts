"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";

export async function createWorldElementDraft() {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("world_elements")
    .insert({
      project_id: project.id,
      name: "New element",
      description: "",
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/world");
  redirect(`/world/${data.id}`);
}

export async function updateWorldElement(
  elementId: string,
  fields: {
    category?: string | null;
    name?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("world_elements")
    .update(fields)
    .eq("id", elementId);
  if (error) throw error;
  revalidatePath("/world");
  revalidatePath(`/world/${elementId}`);
}

export async function deleteWorldElement(elementId: string) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("world_elements")
    .delete()
    .eq("id", elementId);
  if (error) throw error;
  revalidatePath("/world");
  redirect("/world");
}
