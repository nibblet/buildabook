"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function createChapterForBeat(
  projectId: string,
  beatId: string,
): Promise<{ chapterId: string; sceneId: string }> {
  const supabase = await supabaseServer();
  const { data: sibs } = await supabase
    .from("chapters")
    .select("order_index")
    .eq("project_id", projectId);
  const max = (sibs ?? []).reduce(
    (m, r) => Math.max(m, r.order_index ?? -1),
    -1,
  );
  const nextIdx = max + 1;

  const { data: ch, error } = await supabase
    .from("chapters")
    .insert({
      project_id: projectId,
      order_index: nextIdx,
      title: `Chapter ${nextIdx + 1}`,
      status: "planned",
      beat_ids: [beatId],
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: scene, error: scErr } = await supabase
    .from("scenes")
    .insert({
      chapter_id: ch.id,
      order_index: 0,
      status: "planned",
      content: "",
      wordcount: 0,
      beat_ids: [beatId],
    })
    .select("id")
    .single();
  if (scErr) throw scErr;

  revalidatePath("/");
  revalidatePath(`/beats/${beatId}`);
  return { chapterId: ch.id, sceneId: scene.id };
}
