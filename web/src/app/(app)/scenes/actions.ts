"use server";

import { revalidatePath } from "next/cache";
import { firePostSaveScenePipeline } from "@/lib/ai/post-save-scene";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { prosePlainFingerprint } from "@/lib/html";
import { countWords } from "@/lib/utils";
import {
  parseSceneBlueprint,
  type SceneBlueprint,
} from "@/lib/scene-blueprint";

export async function saveSceneContent(
  sceneId: string,
  html: string,
  wordcount: number,
) {
  const supabase = await supabaseServer();
  const words = wordcount || countWords(html);
  const { data: previous } = await supabase
    .from("scenes")
    .select("content, wordcount")
    .eq("id", sceneId)
    .maybeSingle();

  const { error } = await supabase
    .from("scenes")
    .update({
      content: html,
      wordcount: words,
      status: words > 0 ? "drafting" : "planned",
    })
    .eq("id", sceneId);
  if (error) throw error;

  const previousContent = previous?.content ?? "";
  const nextContent = html ?? "";
  if (previousContent.trim() && previousContent !== nextContent) {
    await supabase.from("scene_revisions").insert({
      scene_id: sceneId,
      content: previousContent,
      wordcount: previous?.wordcount ?? countWords(previousContent),
      source: "autosave",
    });
  }

  // Roll chapter wordcount up.
  const { data: scene } = await supabase
    .from("scenes")
    .select("chapter_id")
    .eq("id", sceneId)
    .maybeSingle();
  if (scene?.chapter_id) {
    const { data: sibs } = await supabase
      .from("scenes")
      .select("wordcount")
      .eq("chapter_id", scene.chapter_id);
    const total = (sibs ?? []).reduce((s, r) => s + (r.wordcount ?? 0), 0);
    await supabase
      .from("chapters")
      .update({ wordcount: total })
      .eq("id", scene.chapter_id);
  }

  revalidatePath(`/scenes/${sceneId}`);

  const proseChanged =
    prosePlainFingerprint(previousContent) !== prosePlainFingerprint(nextContent);
  if (proseChanged) {
    firePostSaveScenePipeline(sceneId);
  }
}

export async function moveSceneToChapter(sceneId: string, targetChapterId: string) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();

  const { data: scene } = await supabase
    .from("scenes")
    .select("chapter_id")
    .eq("id", sceneId)
    .maybeSingle();
  if (!scene?.chapter_id) throw new Error("Scene not found.");

  const [{ data: srcCh }, { data: dstCh }] = await Promise.all([
    supabase
      .from("chapters")
      .select("project_id")
      .eq("id", scene.chapter_id)
      .maybeSingle(),
    supabase
      .from("chapters")
      .select("project_id")
      .eq("id", targetChapterId)
      .maybeSingle(),
  ]);

  if (
    srcCh?.project_id !== project.id ||
    dstCh?.project_id !== project.id
  ) {
    throw new Error("Invalid chapter.");
  }

  const { data: sibs } = await supabase
    .from("scenes")
    .select("order_index")
    .eq("chapter_id", targetChapterId);
  const max = (sibs ?? []).reduce(
    (m, r) => Math.max(m, r.order_index ?? -1),
    -1,
  );

  await supabase
    .from("scenes")
    .update({
      chapter_id: targetChapterId,
      order_index: max + 1,
    })
    .eq("id", sceneId);

  // Re-roll wordcounts for both chapters.
  for (const chId of [scene.chapter_id, targetChapterId]) {
    const { data: scs } = await supabase
      .from("scenes")
      .select("wordcount")
      .eq("chapter_id", chId);
    const total = (scs ?? []).reduce((s, r) => s + (r.wordcount ?? 0), 0);
    await supabase.from("chapters").update({ wordcount: total }).eq("id", chId);
  }

  revalidatePath(`/chapters/${scene.chapter_id}`);
  revalidatePath(`/chapters/${targetChapterId}`);
  revalidatePath(`/scenes/${sceneId}`);
  revalidatePath("/");
}

export async function updateSceneCharacterArc(
  sceneId: string,
  characterId: string,
  fields: {
    reader_knowledge?: string | null;
    character_knowledge?: string | null;
    arc_note?: string | null;
  },
) {
  const supabase = await supabaseServer();
  const payload = {
    scene_id: sceneId,
    character_id: characterId,
    reader_knowledge: fields.reader_knowledge ?? null,
    character_knowledge: fields.character_knowledge ?? null,
    arc_note: fields.arc_note ?? null,
    updated_at: new Date().toISOString(),
  };
  const hasAnyValue = [
    payload.reader_knowledge,
    payload.character_knowledge,
    payload.arc_note,
  ].some((v) => Boolean(v && v.trim().length > 0));

  if (!hasAnyValue) {
    const { error } = await supabase
      .from("scene_character_arcs")
      .delete()
      .eq("scene_id", sceneId)
      .eq("character_id", characterId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("scene_character_arcs")
      .upsert(payload, { onConflict: "scene_id,character_id" });
    if (error) throw error;
  }

  revalidatePath(`/scenes/${sceneId}`);
  revalidatePath("/arc-tracker");
}

export async function restoreSceneRevision(sceneId: string, revisionId: string) {
  const supabase = await supabaseServer();
  const { data: revision, error: revisionError } = await supabase
    .from("scene_revisions")
    .select("content, wordcount")
    .eq("id", revisionId)
    .eq("scene_id", sceneId)
    .maybeSingle();
  if (revisionError) throw revisionError;
  if (!revision) throw new Error("Revision not found.");

  const { data: currentScene } = await supabase
    .from("scenes")
    .select("content, wordcount")
    .eq("id", sceneId)
    .maybeSingle();
  if (!currentScene) throw new Error("Scene not found.");

  await supabase.from("scene_revisions").insert({
    scene_id: sceneId,
    content: currentScene.content ?? "",
    wordcount: currentScene.wordcount ?? countWords(currentScene.content ?? ""),
    source: "manual_restore",
  });

  const { error: updateError } = await supabase
    .from("scenes")
    .update({
      content: revision.content,
      wordcount: revision.wordcount || countWords(revision.content),
      status: "drafting",
    })
    .eq("id", sceneId);
  if (updateError) throw updateError;

  revalidatePath(`/scenes/${sceneId}`);
}

export async function updateSceneFields(
  sceneId: string,
  fields: {
    title?: string | null;
    goal?: string | null;
    conflict?: string | null;
    outcome?: string | null;
    status?: "planned" | "drafting" | "done";
    beat_ids?: string[];
  },
) {
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("scenes")
    .update(fields)
    .eq("id", sceneId);
  if (error) throw error;
  revalidatePath(`/scenes/${sceneId}`);
  revalidatePath("/");
}

export async function createSceneForChapter(
  chapterId: string,
  orderIndex?: number,
) {
  const supabase = await supabaseServer();
  if (typeof orderIndex !== "number") {
    const { data: sibs } = await supabase
      .from("scenes")
      .select("order_index")
      .eq("chapter_id", chapterId);
    const max = (sibs ?? []).reduce(
      (m, r) => Math.max(m, r.order_index ?? -1),
      -1,
    );
    orderIndex = max + 1;
  }
  const { data, error } = await supabase
    .from("scenes")
    .insert({
      chapter_id: chapterId,
      order_index: orderIndex,
      status: "planned",
      content: "",
      wordcount: 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath(`/chapters/${chapterId}`);
  return data.id as string;
}

export async function reorderScenes(
  chapterId: string,
  orderedSceneIds: string[],
) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();

  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", chapterId)
    .maybeSingle();
  if (!chapter || chapter.project_id !== project.id)
    throw new Error("Forbidden.");

  const { data: rows } = await supabase
    .from("scenes")
    .select("id")
    .eq("chapter_id", chapterId);
  const allowed = new Set((rows ?? []).map((r) => r.id));
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

  revalidatePath(`/chapters/${chapterId}`);
  revalidatePath("/");
}

export async function createNextChapter(projectId: string) {
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
  const { data, error } = await supabase
    .from("chapters")
    .insert({
      project_id: projectId,
      order_index: nextIdx,
      title: `Chapter ${nextIdx + 1}`,
      status: "planned",
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: scene, error: scErr } = await supabase
    .from("scenes")
    .insert({
      chapter_id: data.id,
      order_index: 0,
      status: "planned",
      content: "",
      wordcount: 0,
    })
    .select("id")
    .single();
  if (scErr) throw scErr;
  revalidatePath("/");
  return { chapterId: data.id as string, sceneId: scene.id as string };
}

export async function saveSceneBlueprint(
  sceneId: string,
  patch: Partial<SceneBlueprint>,
): Promise<SceneBlueprint> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();

  const { data: row } = await supabase
    .from("scenes")
    .select("id, blueprint, chapter_id, chapters!inner(project_id)")
    .eq("id", sceneId)
    .maybeSingle();
  if (!row) throw new Error("Scene not found.");
  const chap = (row as unknown as { chapters?: { project_id?: string } })
    .chapters;
  if (chap?.project_id !== project.id) throw new Error("Scene not in project.");

  const current = parseSceneBlueprint((row as { blueprint?: unknown }).blueprint);
  const next: SceneBlueprint = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("scenes")
    .update({ blueprint: next })
    .eq("id", sceneId);
  if (error) throw error;

  revalidatePath(`/scenes/${sceneId}`);
  return next;
}
