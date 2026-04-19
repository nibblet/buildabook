"use server";

import { revalidatePath } from "next/cache";
import { confirmClaims } from "@/lib/ai/continuity/promote";
import { supabaseServer } from "@/lib/supabase/server";
import type { ContinuityAnnotation } from "@/lib/supabase/types";

export async function listAnnotationsForScene(sceneId: string): Promise<
  Pick<
    ContinuityAnnotation,
    "id" | "paragraph_index" | "tier" | "kind" | "summary" | "status"
  >[]
> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("continuity_annotations")
    .select("id, paragraph_index, tier, kind, summary, status")
    .eq("scene_id", sceneId)
    .in("status", ["pending", "shown"]);
  if (error) throw error;
  return (data ?? []) as Pick<
    ContinuityAnnotation,
    "id" | "paragraph_index" | "tier" | "kind" | "summary" | "status"
  >[];
}

export async function getAnnotationDetail(annotationId: string): Promise<{
  summary: string;
  detail: string | null;
  claim_ids: string[];
}> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("continuity_annotations")
    .select("summary, detail, claim_ids")
    .eq("id", annotationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Annotation not found.");
  return {
    summary: data.summary,
    detail: data.detail,
    claim_ids: (data.claim_ids ?? []) as string[],
  };
}

export async function confirmAnnotationAction(annotationId: string): Promise<void> {
  const supabase = await supabaseServer();
  const { data: ann } = await supabase
    .from("continuity_annotations")
    .select("claim_ids, scene_id")
    .eq("id", annotationId)
    .maybeSingle();
  if (!ann) return;
  if (!ann.claim_ids?.length) {
    await supabase
      .from("continuity_annotations")
      .update({ status: "resolved" })
      .eq("id", annotationId);
    revalidatePath(`/scenes/${ann.scene_id}`);
    return;
  }
  await confirmClaims(supabase, ann.claim_ids as string[]);
  await supabase
    .from("continuity_annotations")
    .update({ status: "resolved" })
    .eq("id", annotationId);
  revalidatePath(`/scenes/${ann.scene_id}`);
}

/** Permanently hide an annotation from the gutter (stored in DB). Session dismiss is client-only. */
export async function dismissAnnotationAction(annotationId: string): Promise<void> {
  const supabase = await supabaseServer();
  const { data: ann } = await supabase
    .from("continuity_annotations")
    .select("scene_id")
    .eq("id", annotationId)
    .maybeSingle();
  await supabase
    .from("continuity_annotations")
    .update({ status: "dismissed", dismissed_session_id: null })
    .eq("id", annotationId);
  if (ann?.scene_id) revalidatePath(`/scenes/${ann.scene_id}`);
}

export async function rejectClaimAction(claimId: string): Promise<void> {
  const supabase = await supabaseServer();
  await supabase
    .from("continuity_claims")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", claimId);

  const { data: refs } = await supabase
    .from("continuity_annotations")
    .select("id, scene_id, claim_ids");
  for (const row of refs ?? []) {
    const ids = (row.claim_ids ?? []) as string[];
    if (ids.includes(claimId)) {
      await supabase.from("continuity_annotations").delete().eq("id", row.id);
      if (row.scene_id) revalidatePath(`/scenes/${row.scene_id}`);
    }
  }
}
