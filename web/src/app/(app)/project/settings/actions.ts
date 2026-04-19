"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { getOrCreateProfile } from "@/lib/profiles";

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

export async function saveProfile(input: {
  displayName: string;
  bio: string;
}) {
  const current = await getOrCreateProfile();
  if (!current) throw new Error("Not signed in.");
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: input.displayName.trim() || null,
      bio: input.bio.trim() || null,
    })
    .eq("user_id", current.profile.user_id);
  if (error) throw error;
  revalidatePath("/project/settings");
}

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME_PREFIX = "image/";

export async function uploadAvatar(formData: FormData) {
  const current = await getOrCreateProfile();
  if (!current) throw new Error("Not signed in.");
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0)
    throw new Error("No file provided.");
  if (!file.type.startsWith(AVATAR_MIME_PREFIX))
    throw new Error("Avatar must be an image.");
  if (file.size > AVATAR_MAX_BYTES)
    throw new Error("Avatar must be under 5MB.");

  const supabase = await supabaseServer();
  const userId = current.profile.user_id;
  const ext = (file.name.split(".").pop() || "png").toLowerCase().slice(0, 5);
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: "3600",
    });
  if (uploadErr) throw uploadErr;

  const { data: publicUrl } = supabase.storage
    .from("avatars")
    .getPublicUrl(path);

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl.publicUrl })
    .eq("user_id", userId);
  if (updateErr) throw updateErr;

  revalidatePath("/project/settings");
  revalidatePath("/");
}

export async function removeAvatar() {
  const current = await getOrCreateProfile();
  if (!current) throw new Error("Not signed in.");
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("user_id", current.profile.user_id);
  if (error) throw error;
  revalidatePath("/project/settings");
  revalidatePath("/");
}
