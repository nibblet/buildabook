"use server";

import { revalidatePath } from "next/cache";
import { extractContinuity } from "@/lib/ai/continuity/extract";
import { findExistingCharacterIdForLabel } from "@/lib/ai/continuity/resolve-subject";
import { findRelationshipForPair } from "@/lib/ai/continuity/resolve-relationship";
import { confirmClaims } from "@/lib/ai/continuity/promote";
import { env } from "@/lib/env";
import { getOrCreateProject } from "@/lib/projects";
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

    await confirmClaims(supabase, input.claimIds);

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

    await confirmClaims(supabase, input.claimIds);

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

    await confirmClaims(supabase, input.claimIds);

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

/** Finds or creates a relationship row for the pair, then merges and promotes claims (same as merge into existing). */
export async function ensureRelationshipAndMergeClaimsAction(input: {
  chapterId: string;
  claimIds: string[];
  charAId: string;
  charBId: string;
  type: string | null;
}): Promise<{
  ok: boolean;
  count?: number;
  relationshipId?: string;
  created?: boolean;
  error?: string;
}> {
  try {
    if (!input.claimIds.length) return { ok: true, count: 0 };
    const a = input.charAId.trim();
    const b = input.charBId.trim();
    if (!a || !b) return { ok: false, error: "Choose both characters." };
    if (a === b) return { ok: false, error: "Pick two different characters." };

    const project = await getOrCreateProject();
    if (!project) return { ok: false, error: "No project." };

    const supabase = await supabaseServer();
    const { data: chapter } = await supabase
      .from("chapters")
      .select("project_id")
      .eq("id", input.chapterId)
      .maybeSingle();
    if (!chapter || chapter.project_id !== project.id) {
      return { ok: false, error: "Chapter not found." };
    }

    const { data: relRows } = await supabase
      .from("relationships")
      .select("id, char_a_id, char_b_id")
      .eq("project_id", project.id);

    const existing = findRelationshipForPair(relRows ?? [], a, b);
    let relationshipId = existing?.id ?? null;
    let created = false;

    if (!relationshipId) {
      const { data: inserted, error: insErr } = await supabase
        .from("relationships")
        .insert({
          project_id: project.id,
          char_a_id: a,
          char_b_id: b,
          type: input.type?.trim() || null,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      relationshipId = inserted.id;
      created = true;
    }

    const { error } = await supabase
      .from("continuity_claims")
      .update({
        subject_character_id: null,
        subject_world_element_id: null,
        subject_relationship_id: relationshipId,
        proposed_destination_type: "relationship",
        resolution_status: "resolved",
        resolution_note: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", input.claimIds);
    if (error) throw error;

    await confirmClaims(supabase, input.claimIds);

    revalidatePath("/relationships");
    revalidatePath(`/chapters/${input.chapterId}`);
    revalidatePath(`/chapters/${input.chapterId}/codex-review`);
    return {
      ok: true,
      count: input.claimIds.length,
      relationshipId,
      created,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}

export async function buildCharacterFromClaimsAction(input: {
  chapterId: string;
  claimIds: string[];
  name: string | null;
}): Promise<{ ok: boolean; count?: number; characterId?: string; error?: string }> {
  try {
    if (!input.claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();
    const { data: rows, error: rowsError } = await supabase
      .from("continuity_claims")
      .select("id, project_id, subject_label, predicate, object_text")
      .in("id", input.claimIds);
    if (rowsError) throw rowsError;
    if (!rows?.length) return { ok: true, count: 0 };

    const projectId = rows[0]?.project_id;
    if (!projectId) return { ok: false, error: "Missing project for selected claims." };

    const labels = rows
      .map((r) => (r.subject_label ?? "").trim())
      .filter(Boolean);
    const fallbackName = labels[0] ?? "Unnamed Character";
    const name = (input.name ?? "").trim() || fallbackName;

    const byLabel = new Map<string, number>();
    for (const label of labels) byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
    const aliases = [...byLabel.keys()].filter((label) => label.toLowerCase() !== name.toLowerCase());

    const summaryLines = rows
      .slice(0, 5)
      .map((r) => `${r.predicate}: ${r.object_text}`)
      .filter(Boolean);
    const voiceNotes = summaryLines.length
      ? `Built from codex review:\n${summaryLines.join("\n")}`
      : "Built from codex review.";

    const { data: projectChars } = await supabase
      .from("characters")
      .select("id, name, aliases")
      .eq("project_id", projectId);

    const entityChars = (projectChars ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      aliases: c.aliases,
    }));
    const matchedId = findExistingCharacterIdForLabel(name, entityChars);
    const existing =
      matchedId != null
        ? (projectChars ?? []).find((c) => c.id === matchedId)
        : undefined;

    let characterId = existing?.id ?? null;
    if (existing?.id) {
      const mergedAliases = new Set<string>(existing.aliases ?? []);
      for (const alias of aliases) mergedAliases.add(alias);
      await supabase
        .from("characters")
        .update({ aliases: [...mergedAliases] })
        .eq("id", existing.id);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("characters")
        .insert({
          project_id: projectId,
          name,
          aliases,
          voice_notes: voiceNotes,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      characterId = inserted.id;
    }

    const { error: updateError } = await supabase
      .from("continuity_claims")
      .update({
        subject_character_id: characterId,
        subject_world_element_id: null,
        subject_relationship_id: null,
        proposed_destination_type: "character",
        resolution_status: "resolved",
        resolution_note: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", input.claimIds);
    if (updateError) throw updateError;

    await confirmClaims(supabase, input.claimIds);

    revalidatePath(`/chapters/${input.chapterId}`);
    revalidatePath(`/chapters/${input.chapterId}/codex-review`);
    return { ok: true, count: input.claimIds.length, characterId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}

export async function buildWorldFromClaimsAction(input: {
  chapterId: string;
  claimIds: string[];
  name: string | null;
  category: string | null;
}): Promise<{ ok: boolean; count?: number; worldElementId?: string; error?: string }> {
  try {
    if (!input.claimIds.length) return { ok: true, count: 0 };
    const supabase = await supabaseServer();
    const { data: rows, error: rowsError } = await supabase
      .from("continuity_claims")
      .select(
        "id, project_id, subject_label, predicate, object_text, proposed_world_category",
      )
      .in("id", input.claimIds);
    if (rowsError) throw rowsError;
    if (!rows?.length) return { ok: true, count: 0 };

    const projectId = rows[0]?.project_id;
    if (!projectId) return { ok: false, error: "Missing project for selected claims." };

    const labels = rows
      .map((r) => (r.subject_label ?? "").trim())
      .filter(Boolean);
    const fallbackName = labels[0] ?? "Unnamed entry";
    const name = (input.name ?? "").trim() || fallbackName;

    const proposedCats = rows
      .map((r) => (r.proposed_world_category ?? "").trim())
      .filter(Boolean);
    const category =
      (input.category ?? "").trim() ||
      proposedCats[0] ||
      null;

    const byLabel = new Map<string, number>();
    for (const label of labels) byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
    const aliases = [...byLabel.keys()].filter(
      (label) => label.toLowerCase() !== name.toLowerCase(),
    );

    const { data: existing } = await supabase
      .from("world_elements")
      .select("id, aliases")
      .eq("project_id", projectId)
      .ilike("name", name)
      .maybeSingle();

    let worldElementId = existing?.id ?? null;
    if (existing?.id) {
      const mergedAliases = new Set<string>(existing.aliases ?? []);
      for (const alias of aliases) mergedAliases.add(alias);
      await supabase
        .from("world_elements")
        .update({ aliases: [...mergedAliases] })
        .eq("id", existing.id);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("world_elements")
        .insert({
          project_id: projectId,
          name,
          category,
          description: null,
          aliases,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      worldElementId = inserted.id;
    }

    const { error: updateError } = await supabase
      .from("continuity_claims")
      .update({
        subject_character_id: null,
        subject_world_element_id: worldElementId,
        subject_relationship_id: null,
        proposed_destination_type: "world_element",
        proposed_world_category: category,
        resolution_status: "resolved",
        resolution_note: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", input.claimIds);
    if (updateError) throw updateError;

    await confirmClaims(supabase, input.claimIds);

    revalidatePath(`/chapters/${input.chapterId}`);
    revalidatePath(`/chapters/${input.chapterId}/codex-review`);
    return { ok: true, count: input.claimIds.length, worldElementId: worldElementId ?? undefined };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}

/** Clears per-scene extract markers and re-runs continuity extraction for every scene in the chapter. */
export async function rerunChapterContinuityExtractionAction(chapterId: string): Promise<{
  ok: boolean;
  scenesProcessed?: number;
  error?: string;
}> {
  try {
    if (!env.continuityEditorEnabled()) {
      return {
        ok: false,
        error:
          "Continuity extraction is disabled (CONTINUITY_EDITOR_ENABLED=false).",
      };
    }
    const project = await getOrCreateProject();
    if (!project) return { ok: false, error: "No project." };

    const supabase = await supabaseServer();
    const { data: chapter } = await supabase
      .from("chapters")
      .select("id, project_id")
      .eq("id", chapterId)
      .maybeSingle();
    if (!chapter || chapter.project_id !== project.id) {
      return { ok: false, error: "Chapter not found." };
    }

    const { data: scenes } = await supabase
      .from("scenes")
      .select("id")
      .eq("chapter_id", chapterId)
      .order("order_index");
    const ids = (scenes ?? []).map((s) => s.id);
    if (!ids.length) return { ok: true, scenesProcessed: 0 };

    for (const sceneId of ids) {
      await supabase
        .from("scenes")
        .update({
          continuity_content_hash: null,
          continuity_extractor_version: 0,
        })
        .eq("id", sceneId);
      await extractContinuity(sceneId);
    }

    revalidatePath(`/chapters/${chapterId}`);
    revalidatePath(`/chapters/${chapterId}/codex-review`);
    return { ok: true, scenesProcessed: ids.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed.",
    };
  }
}
