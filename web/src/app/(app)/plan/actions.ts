"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";

export async function reorderChaptersInProject(
  orderedChapterIds: string[],
): Promise<void> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", project.id);
  const allowed = new Set((chapters ?? []).map((c) => c.id));
  if (orderedChapterIds.length !== allowed.size)
    throw new Error("Chapter list mismatch.");
  for (const id of orderedChapterIds) {
    if (!allowed.has(id)) throw new Error("Invalid chapter.");
  }

  await Promise.all(
    orderedChapterIds.map((id, orderIndex) =>
      supabase.from("chapters").update({ order_index: orderIndex }).eq("id", id),
    ),
  );

  revalidatePath("/plan");
  revalidatePath("/spine");
  revalidatePath("/outline");
  revalidatePath("/manuscript");
  revalidatePath("/");
}

export async function reorderScenesInChapter(
  chapterId: string,
  orderedSceneIds: string[],
): Promise<void> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id")
    .eq("id", chapterId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!chapter) throw new Error("Chapter not found.");

  const { data: scenes } = await supabase
    .from("scenes")
    .select("id")
    .eq("chapter_id", chapterId);
  const allowed = new Set((scenes ?? []).map((s) => s.id));
  if (orderedSceneIds.length !== allowed.size)
    throw new Error("Scene list mismatch.");
  for (const id of orderedSceneIds) {
    if (!allowed.has(id)) throw new Error("Invalid scene.");
  }

  await Promise.all(
    orderedSceneIds.map((id, orderIndex) =>
      supabase.from("scenes").update({ order_index: orderIndex }).eq("id", id),
    ),
  );

  revalidatePath("/plan");
  revalidatePath("/outline");
  revalidatePath(`/chapters/${chapterId}`);
  revalidatePath("/");
}
