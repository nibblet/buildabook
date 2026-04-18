"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";

export async function reorderBeats(orderedBeatIds: string[]) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();
  const { data: beats } = await supabase
    .from("beats")
    .select("id")
    .eq("project_id", project.id);
  const allowed = new Set((beats ?? []).map((b) => b.id));
  if (orderedBeatIds.length !== allowed.size)
    throw new Error("Beat list mismatch.");
  for (const id of orderedBeatIds) {
    if (!allowed.has(id)) throw new Error("Invalid beat.");
  }

  await Promise.all(
    orderedBeatIds.map((id, orderIndex) =>
      supabase.from("beats").update({ order_index: orderIndex }).eq("id", id),
    ),
  );

  revalidatePath("/spine");
  revalidatePath("/");
}

export async function updateBeatFields(
  beatId: string,
  fields: {
    title?: string;
    description?: string | null;
    why_it_matters?: string | null;
  },
) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();
  const { data: beat } = await supabase
    .from("beats")
    .select("id")
    .eq("id", beatId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!beat) throw new Error("Beat not found.");

  const { error } = await supabase
    .from("beats")
    .update(fields)
    .eq("id", beatId);
  if (error) throw error;
  revalidatePath("/spine");
  revalidatePath(`/beats/${beatId}`);
  revalidatePath("/");
}

/** Replace `sourceBeatId` with `targetBeatId` on all scenes/chapters, then delete the source beat. */
export async function mergeBeatsInto(
  sourceBeatId: string,
  targetBeatId: string,
) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  if (sourceBeatId === targetBeatId) return;

  const supabase = await supabaseServer();
  const { data: pair } = await supabase
    .from("beats")
    .select("id")
    .eq("project_id", project.id)
    .in("id", [sourceBeatId, targetBeatId]);
  if ((pair ?? []).length !== 2) throw new Error("Invalid beats.");

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, beat_ids")
    .eq("project_id", project.id);

  for (const c of chapters ?? []) {
    const ids = (c.beat_ids ?? []).map((bid: string) =>
      bid === sourceBeatId ? targetBeatId : bid,
    );
    const uniq = [...new Set(ids)];
    await supabase.from("chapters").update({ beat_ids: uniq }).eq("id", c.id);
  }

  const chIds = (chapters ?? []).map((c) => c.id);
  if (chIds.length) {
    const { data: scenes } = await supabase
      .from("scenes")
      .select("id, beat_ids")
      .in("chapter_id", chIds);
    for (const s of scenes ?? []) {
      const ids = (s.beat_ids ?? []).map((bid: string) =>
        bid === sourceBeatId ? targetBeatId : bid,
      );
      const uniq = [...new Set(ids)];
      await supabase.from("scenes").update({ beat_ids: uniq }).eq("id", s.id);
    }
  }

  await supabase.from("beats").delete().eq("id", sourceBeatId);

  revalidatePath("/spine");
  revalidatePath("/");
  revalidatePath(`/beats/${targetBeatId}`);
}
