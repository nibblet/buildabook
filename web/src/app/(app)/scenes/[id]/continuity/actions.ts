"use server";

import { revalidatePath } from "next/cache";
import { extractContinuityRange } from "@/lib/ai/continuity/extract";
import { confirmClaims } from "@/lib/ai/continuity/promote";
import { validateParagraphRange } from "@/lib/ai/continuity/paragraph-range";
import { splitDraftIntoParagraphs } from "@/lib/prose/split-paragraphs";
import { env } from "@/lib/env";
import { getOrCreateProject } from "@/lib/projects";
import { supabaseServer } from "@/lib/supabase/server";
import type { ContinuityAnnotation } from "@/lib/supabase/types";

function htmlToPlainForParagraphs(html: string): string {
  return html
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

async function assertSceneInProject(sceneId: string): Promise<
  | { ok: true; content: string }
  | { ok: false; error: string }
> {
  const project = await getOrCreateProject();
  if (!project) return { ok: false, error: "No active project." };

  const supabase = await supabaseServer();
  const { data: scene } = await supabase
    .from("scenes")
    .select("id, content, chapters!inner(project_id)")
    .eq("id", sceneId)
    .maybeSingle();

  if (!scene) return { ok: false, error: "Scene not found." };

  const chapter = scene.chapters as unknown as { project_id: string };
  if (chapter?.project_id !== project.id) {
    return { ok: false, error: "Scene not found." };
  }

  return { ok: true, content: (scene.content as string) ?? "" };
}

export async function extractContinuityFromSelectionAction(
  sceneId: string,
  paragraphStart: number,
  paragraphEnd: number,
): Promise<{ ok: boolean; claimCount?: number; error?: string }> {
  if (!env.continuityEditorEnabled()) {
    return { ok: false, error: "Continuity extraction is disabled." };
  }

  const access = await assertSceneInProject(sceneId);
  if (!access.ok) return { ok: false, error: access.error };

  const paragraphs = splitDraftIntoParagraphs(
    htmlToPlainForParagraphs(access.content),
  );
  const rangeCheck = validateParagraphRange(
    paragraphs,
    paragraphStart,
    paragraphEnd,
  );
  if (!rangeCheck.ok) {
    return { ok: false, error: rangeCheck.error };
  }

  try {
    const result = await extractContinuityRange(sceneId, {
      paragraphStart,
      paragraphEnd,
    });
    revalidatePath(`/scenes/${sceneId}`);
    return { ok: true, claimCount: result.claimCount };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Continuity extraction failed.",
    };
  }
}

export async function extractContinuityWholeSceneAction(
  sceneId: string,
): Promise<{ ok: boolean; claimCount?: number; error?: string }> {
  if (!env.continuityEditorEnabled()) {
    return { ok: false, error: "Continuity extraction is disabled." };
  }

  const access = await assertSceneInProject(sceneId);
  if (!access.ok) return { ok: false, error: access.error };

  const paragraphs = splitDraftIntoParagraphs(
    htmlToPlainForParagraphs(access.content),
  );
  if (!paragraphs.some((p) => p.trim())) {
    return { ok: false, error: "Scene has no prose to extract from." };
  }

  try {
    const result = await extractContinuityRange(sceneId, {
      paragraphStart: 0,
      paragraphEnd: paragraphs.length - 1,
      updateContentHash: true,
      force: true,
    });
    revalidatePath(`/scenes/${sceneId}`);
    return { ok: true, claimCount: result.claimCount };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Continuity extraction failed.",
    };
  }
}

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
