"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { getPlotTemplate, type PlotTemplateId } from "@/lib/plot-templates";

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

export type ApplyTemplateResult = {
  mode: "append" | "replace";
  insertedBeatCount: number;
};

/**
 * Append or replace a plot template's beats on the current project.
 *
 * - `append` is always safe: inserts at the tail of the existing order.
 * - `replace` deletes all existing beats, but only when no chapter or scene
 *   references any of them via `beat_ids`. If references exist the call
 *   throws — caller must fall back to `append` and surface a message.
 */
export async function applyPlotTemplate(
  templateId: PlotTemplateId,
  mode: "append" | "replace",
): Promise<ApplyTemplateResult> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const template = getPlotTemplate(templateId);
  if (!template) throw new Error("Unknown template.");
  const supabase = await supabaseServer();

  const { data: existing } = await supabase
    .from("beats")
    .select("id, order_index")
    .eq("project_id", project.id);
  const existingBeats = existing ?? [];

  if (mode === "replace" && existingBeats.length > 0) {
    const existingIds = new Set(existingBeats.map((b) => b.id));
    const [{ data: chapters }, { data: chaptersForScenes }] = await Promise.all(
      [
        supabase
          .from("chapters")
          .select("id, beat_ids")
          .eq("project_id", project.id),
        supabase
          .from("chapters")
          .select("id")
          .eq("project_id", project.id),
      ],
    );
    const referencedFromChapter = (chapters ?? []).some((c) =>
      (c.beat_ids ?? []).some((id: string) => existingIds.has(id)),
    );
    const chIds = (chaptersForScenes ?? []).map((c) => c.id);
    let referencedFromScene = false;
    if (chIds.length) {
      const { data: scenes } = await supabase
        .from("scenes")
        .select("beat_ids")
        .in("chapter_id", chIds);
      referencedFromScene = (scenes ?? []).some((s) =>
        (s.beat_ids ?? []).some((id: string) => existingIds.has(id)),
      );
    }
    if (referencedFromChapter || referencedFromScene) {
      throw new Error(
        "Cannot replace: existing beats are still referenced by chapters or scenes. Append instead, or detach references first.",
      );
    }
    await supabase.from("beats").delete().eq("project_id", project.id);
  }

  const startOrder =
    mode === "replace"
      ? 0
      : existingBeats.reduce(
          (max, b) => Math.max(max, (b.order_index ?? -1) + 1),
          0,
        );

  const rows = template.beats.map((b, idx) => ({
    project_id: project.id,
    order_index: startOrder + idx,
    act: b.act,
    beat_type: b.beat_type,
    title: b.title,
    description: b.description,
    why_it_matters: b.why_it_matters,
    target_chapter: b.target_chapter,
  }));

  const { error } = await supabase.from("beats").insert(rows);
  if (error) throw error;

  revalidatePath("/spine");
  revalidatePath("/");

  return { mode, insertedBeatCount: rows.length };
}
