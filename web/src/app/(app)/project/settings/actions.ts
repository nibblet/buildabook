"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";

type Input = {
  title: string;
  premise: string;
  styleNotes: string;
  paranormalType: string;
  targetWordcount: number;
  personaAliases: Record<string, string | undefined>;
};

export async function saveProjectSettings(input: Input) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();

  const { data: row } = await supabase
    .from("projects")
    .select("persona_aliases")
    .eq("id", project.id)
    .maybeSingle();

  const mergedAliases: Record<string, string> = {
    ...((row?.persona_aliases as Record<string, string>) || {}),
  };
  for (const [k, v] of Object.entries(input.personaAliases)) {
    if (v && String(v).trim()) mergedAliases[k] = String(v).trim();
    else delete mergedAliases[k];
  }

  const { error } = await supabase
    .from("projects")
    .update({
      title: input.title,
      premise: input.premise,
      style_notes: input.styleNotes,
      paranormal_type: input.paranormalType,
      target_wordcount: input.targetWordcount,
      persona_aliases: mergedAliases,
    })
    .eq("id", project.id);
  if (error) throw error;

  revalidatePath("/");
  revalidatePath("/project/settings");
}

export async function createStyleSample(input: {
  label: string;
  content: string;
}) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();
  const { error } = await supabase.from("style_samples").insert({
    project_id: project.id,
    label: input.label.trim() || null,
    content: input.content.trim() || null,
    is_default: false,
  });
  if (error) throw error;
  revalidatePath("/project/settings");
}

export async function updateStyleSample(
  sampleId: string,
  input: { label: string; content: string },
) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();
  const { data: sample } = await supabase
    .from("style_samples")
    .select("project_id")
    .eq("id", sampleId)
    .maybeSingle();
  if (!sample || sample.project_id !== project.id)
    throw new Error("Sample not found.");

  const { error } = await supabase
    .from("style_samples")
    .update({
      label: input.label.trim() || null,
      content: input.content.trim() || null,
    })
    .eq("id", sampleId);
  if (error) throw error;
  revalidatePath("/project/settings");
}

export async function deleteStyleSample(sampleId: string) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("style_samples")
    .delete()
    .eq("id", sampleId)
    .eq("project_id", project.id);
  if (error) throw error;
  revalidatePath("/project/settings");
}
