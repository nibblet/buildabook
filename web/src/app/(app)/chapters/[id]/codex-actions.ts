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

export async function confirmClaimIdsAction(
  chapterId: string,
  claimIds: string[],
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (!claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();
    await confirmClaims(supabase, claimIds);
    revalidatePath(`/chapters/${chapterId}`);
    revalidatePath(`/chapters/${chapterId}/codex-review`);
    return { ok: true, count: claimIds.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}

export async function rejectClaimIdsAction(
  chapterId: string,
  claimIds: string[],
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (!claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();
    const { error } = await supabase
      .from("continuity_claims")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .in("id", claimIds);
    if (error) throw error;
    revalidatePath(`/chapters/${chapterId}`);
    revalidatePath(`/chapters/${chapterId}/codex-review`);
    return { ok: true, count: claimIds.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}

export async function resolveClaimsToCharacterAction(input: {
  chapterId: string;
  claimIds: string[];
  characterId: string;
  alias: string | null;
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (!input.claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();

    if (input.alias?.trim()) {
      const { data: character } = await supabase
        .from("characters")
        .select("aliases")
        .eq("id", input.characterId)
        .maybeSingle();
      const aliases = new Set<string>(character?.aliases ?? []);
      aliases.add(input.alias.trim());
      await supabase
        .from("characters")
        .update({ aliases: [...aliases] })
        .eq("id", input.characterId);
    }

    const { error } = await supabase
      .from("continuity_claims")
      .update({
        subject_character_id: input.characterId,
        subject_world_element_id: null,
        subject_relationship_id: null,
        proposed_destination_type: "character",
        resolution_status: "resolved",
        resolution_note: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", input.claimIds);
    if (error) throw error;

    revalidatePath(`/chapters/${input.chapterId}`);
    revalidatePath(`/chapters/${input.chapterId}/codex-review`);
    return { ok: true, count: input.claimIds.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}

export async function resolveClaimsToWorldElementAction(input: {
  chapterId: string;
  claimIds: string[];
  worldElementId: string;
  alias: string | null;
  category: string | null;
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (!input.claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();

    const { data: element } = await supabase
      .from("world_elements")
      .select("aliases, category")
      .eq("id", input.worldElementId)
      .maybeSingle();

    const aliases = new Set<string>(element?.aliases ?? []);
    if (input.alias?.trim()) aliases.add(input.alias.trim());

    await supabase
      .from("world_elements")
      .update({
        aliases: [...aliases],
        category: element?.category ?? input.category,
      })
      .eq("id", input.worldElementId);

    const { error } = await supabase
      .from("continuity_claims")
      .update({
        subject_character_id: null,
        subject_world_element_id: input.worldElementId,
        subject_relationship_id: null,
        proposed_destination_type: "world_element",
        proposed_world_category: input.category,
        resolution_status: "resolved",
        resolution_note: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", input.claimIds);
    if (error) throw error;

    revalidatePath(`/chapters/${input.chapterId}`);
    revalidatePath(`/chapters/${input.chapterId}/codex-review`);
    return { ok: true, count: input.claimIds.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}

export async function resolveClaimsToRelationshipAction(input: {
  chapterId: string;
  claimIds: string[];
  relationshipId: string;
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    if (!input.claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();
    const { error } = await supabase
      .from("continuity_claims")
      .update({
        subject_character_id: null,
        subject_world_element_id: null,
        subject_relationship_id: input.relationshipId,
        proposed_destination_type: "relationship",
        resolution_status: "resolved",
        resolution_note: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", input.claimIds);
    if (error) throw error;

    revalidatePath(`/chapters/${input.chapterId}`);
    revalidatePath(`/chapters/${input.chapterId}/codex-review`);
    return { ok: true, count: input.claimIds.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}
