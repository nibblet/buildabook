"use server";

import { revalidatePath } from "next/cache";
import { confirmClaims } from "@/lib/ai/continuity/promote";
import { supabaseServer } from "@/lib/supabase/server";

export async function listCodexClaimsForChapter(chapterId: string) {
  const supabase = await supabaseServer();
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, title, order_index")
    .eq("chapter_id", chapterId);
  const sceneIds = (scenes ?? []).map((s) => s.id);
  if (!sceneIds.length) return { claims: [], scenes: scenes ?? [] };

  const { data: claims, error } = await supabase
    .from("continuity_claims")
    .select("*")
    .in("source_scene_id", sceneIds)
    .eq("status", "auto")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return {
    claims: claims ?? [],
    scenes: scenes ?? [],
  };
}

export async function acceptHighConfidenceClaimsChapterAction(
  chapterId: string,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const supabase = await supabaseServer();
    const { data: scenes } = await supabase
      .from("scenes")
      .select("id")
      .eq("chapter_id", chapterId);
    const sceneIds = (scenes ?? []).map((s) => s.id);
    if (!sceneIds.length) return { ok: true, count: 0 };

    const { data: highs } = await supabase
      .from("continuity_claims")
      .select("id")
      .in("source_scene_id", sceneIds)
      .eq("status", "auto")
      .eq("confidence", "high");
    const ids = (highs ?? []).map((r) => r.id);
    if (!ids.length) return { ok: true, count: 0 };

    await confirmClaims(supabase, ids);
    revalidatePath(`/chapters/${chapterId}`);
    revalidatePath(`/chapters/${chapterId}/codex-review`);
    return { ok: true, count: ids.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}

export async function rejectAllAutoClaimsChapterAction(
  chapterId: string,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const supabase = await supabaseServer();
    const { data: scenes } = await supabase
      .from("scenes")
      .select("id")
      .eq("chapter_id", chapterId);
    const sceneIds = (scenes ?? []).map((s) => s.id);
    if (!sceneIds.length) return { ok: true, count: 0 };

    const { data: autos } = await supabase
      .from("continuity_claims")
      .select("id")
      .in("source_scene_id", sceneIds)
      .eq("status", "auto");
    const ids = (autos ?? []).map((r) => r.id);
    if (!ids.length) return { ok: true, count: 0 };

    await supabase
      .from("continuity_claims")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    await supabase
      .from("continuity_annotations")
      .delete()
      .in(
        "scene_id",
        sceneIds,
      );

    revalidatePath(`/chapters/${chapterId}`);
    revalidatePath(`/chapters/${chapterId}/codex-review`);
    return { ok: true, count: ids.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}

export async function confirmClaimIdsAction(claimIds: string[]) {
  const supabase = await supabaseServer();
  await confirmClaims(supabase, claimIds);
  for (const id of claimIds) {
    const { data: row } = await supabase
      .from("continuity_claims")
      .select("source_scene_id")
      .eq("id", id)
      .maybeSingle();
    if (row?.source_scene_id) {
      revalidatePath(`/scenes/${row.source_scene_id}`);
    }
  }
}
