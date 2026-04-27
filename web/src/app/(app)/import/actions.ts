"use server";

import { revalidatePath } from "next/cache";
import { extractDraft } from "@/lib/ai/extract";
import { runPostImportScenePipeline } from "@/lib/ai/post-save-scene";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import {
  buildImportReview,
  buildSceneInsertRows,
  ImportCommitPayloadSchema,
  type ImportCommitPayload,
  type ImportReview,
} from "@/lib/import/import-model";
import { getOrCreateProject } from "@/lib/projects";
import { supabaseServer } from "@/lib/supabase/server";
import type { Beat, Chapter, Character, WorldElement } from "@/lib/supabase/types";

export type RunImportExtractionResult =
  | { ok: true; review: ImportReview }
  | { ok: false; error: string };

export type CommitImportResult = {
  chapterId: string;
  sceneIds: string[];
  charactersCreated: number;
  worldElementsCreated: number;
  openThreadsCreated: number;
  styleSamplesCreated: number;
};

export async function runImportExtraction(
  draftText: string,
): Promise<RunImportExtractionResult> {
  try {
    const text = draftText.trim();
    if (!text) return { ok: false, error: "Paste a scene or chapter first." };
    if (text.length > 120_000) {
      return {
        ok: false,
        error: "That import is too long for one pass. Try one chapter at a time.",
      };
    }

    const project = await getOrCreateProject();
    if (!project) return { ok: false, error: "No active project." };
    const supabase = await supabaseServer();
    const [
      charactersResult,
      worldElementsResult,
      chaptersResult,
      beatsResult,
    ] = await Promise.all([
        supabase.from("characters").select("id, name, aliases").eq("project_id", project.id),
        supabase
          .from("world_elements")
          .select("id, name, aliases")
          .eq("project_id", project.id),
        supabase
          .from("chapters")
          .select("id, title, order_index")
          .eq("project_id", project.id)
          .order("order_index", { ascending: true }),
        supabase
          .from("beats")
          .select("id, beat_type, title")
          .eq("project_id", project.id)
          .order("order_index", { ascending: true }),
      ]);
    const contextError =
      charactersResult.error ??
      worldElementsResult.error ??
      chaptersResult.error ??
      beatsResult.error;
    if (contextError) {
      return {
        ok: false,
        error: "Could not load existing book context for import review.",
      };
    }

    const extracted = await extractDraft(text, {
      projectId: project.id,
      writingProfile: parseWritingProfile(project.writing_profile),
    });

    return {
      ok: true,
      review: buildImportReview(extracted, {
        characters: (charactersResult.data ?? []) as Pick<
          Character,
          "id" | "name" | "aliases"
        >[],
        worldElements: (worldElementsResult.data ?? []) as Pick<
          WorldElement,
          "id" | "name" | "aliases"
        >[],
        chapters: (chaptersResult.data ?? []) as Pick<
          Chapter,
          "id" | "title" | "order_index"
        >[],
        beats: (beatsResult.data ?? []) as Pick<Beat, "id" | "beat_type" | "title">[],
      }),
    };
  } catch (error) {
    console.error("runImportExtraction failed:", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Import extraction failed. Try shortening the draft or retrying.",
    };
  }
}

export async function commitImport(
  rawPayload: ImportCommitPayload,
): Promise<CommitImportResult> {
  const payload = ImportCommitPayloadSchema.parse(rawPayload);
  const project = await getOrCreateProject();
  if (!project) throw new Error("No active project.");
  const supabase = await supabaseServer();
  const cleanup = {
    chapterId: null as string | null,
    sceneIds: [] as string[],
    characterIds: [] as string[],
    worldElementIds: [] as string[],
    openThreadIds: [] as string[],
    styleSampleIds: [] as string[],
  };

  try {
    const selectedCharacterKeys = new Set(payload.selectedCharacterKeys);
    const selectedWorldElementKeys = new Set(payload.selectedWorldElementKeys);
    const existingCharacterIdsByImportedName = new Map<string, string>();
    await validateCommitReferences(payload, project.id);

    for (const character of payload.review.characters) {
      if (character.match.existingId) {
        existingCharacterIdsByImportedName.set(character.name, character.match.existingId);
      }
    }

    const resolvedChapter = await resolveImportChapter(payload, project.id);
    const chapterId = resolvedChapter.id;
    cleanup.chapterId = resolvedChapter.created ? resolvedChapter.id : null;

    const newCharacters = payload.review.characters.filter(
      (character) =>
        selectedCharacterKeys.has(character.key) && character.match.kind === "new",
    );
    const newCharacterIdsByImportedName = new Map<string, string>();
    if (newCharacters.length > 0) {
      const { data: inserted, error } = await supabase
        .from("characters")
        .insert(
          newCharacters.map((character) => ({
            project_id: project.id,
            name: character.name,
            role: character.role,
            species: character.species,
            archetype: character.archetype,
            appearance: character.appearance,
            voice_notes: character.voice_notes,
            powers: character.powers,
            backstory: character.backstory,
            aliases: character.aliases,
          })),
        )
        .select("id, name");
      if (error) throw error;
      for (const row of inserted ?? []) {
        cleanup.characterIds.push(row.id);
        newCharacterIdsByImportedName.set(row.name, row.id);
      }
    }

    const newWorldElements = payload.review.worldElements.filter(
      (element) => selectedWorldElementKeys.has(element.key) && element.match.kind === "new",
    );
    if (newWorldElements.length > 0) {
      const { data: inserted, error } = await supabase
        .from("world_elements")
        .insert(
          newWorldElements.map((element) => ({
            project_id: project.id,
            category: element.category,
            name: element.name,
            description: element.description,
          })),
        )
        .select("id");
      if (error) throw error;
      cleanup.worldElementIds.push(...(inserted ?? []).map((row) => row.id));
    }

    const { data: existingScenes, error: existingScenesError } = await supabase
      .from("scenes")
      .select("order_index")
      .eq("chapter_id", chapterId);
    if (existingScenesError) throw existingScenesError;
    const startOrder = (existingScenes ?? []).reduce(
      (max, scene) => Math.max(max, (scene.order_index ?? -1) + 1),
      0,
    );

    const sceneRows = buildSceneInsertRows({
      review: payload.review,
      chapterId,
      startOrder,
      existingCharacterIdsByImportedName,
      newCharacterIdsByImportedName,
    });
    const { data: insertedScenes, error: sceneError } = await supabase
      .from("scenes")
      .insert(sceneRows)
      .select("id");
    if (sceneError) throw sceneError;
    cleanup.sceneIds.push(...(insertedScenes ?? []).map((scene) => scene.id));

    if (payload.createOpenThreads && payload.review.openThreads.length > 0) {
      const { data: inserted, error } = await supabase
        .from("open_threads")
        .insert(
          payload.review.openThreads.map((thread) => ({
            project_id: project.id,
            question: thread.question,
            opened_in_chapter_id: chapterId,
          })),
        )
        .select("id");
      if (error) throw error;
      cleanup.openThreadIds.push(...(inserted ?? []).map((row) => row.id));
    }

    if (payload.createStyleSample && payload.review.styleSample?.content.trim()) {
      const { data: inserted, error } = await supabase
        .from("style_samples")
        .insert({
          project_id: project.id,
          label: payload.review.styleSample.label || "import",
          content: payload.review.styleSample.content,
          is_default: false,
        })
        .select("id");
      if (error) throw error;
      cleanup.styleSampleIds.push(...(inserted ?? []).map((row) => row.id));
    }

    const { data: allChapterScenes, error: allChapterScenesError } = await supabase
      .from("scenes")
      .select("wordcount")
      .eq("chapter_id", chapterId);
    if (allChapterScenesError) throw allChapterScenesError;
    const chapterWordcount = (allChapterScenes ?? []).reduce(
      (sum, scene) => sum + (scene.wordcount ?? 0),
      0,
    );
    const { error: chapterUpdateError } = await supabase
      .from("chapters")
      .update({ wordcount: chapterWordcount, status: "drafting" })
      .eq("id", chapterId);
    if (chapterUpdateError) throw chapterUpdateError;

    revalidatePath("/");
    revalidatePath("/manuscript");
    revalidatePath(`/chapters/${chapterId}`);

    const result = {
      chapterId,
      sceneIds: cleanup.sceneIds,
      charactersCreated: newCharacters.length,
      worldElementsCreated: newWorldElements.length,
      openThreadsCreated: cleanup.openThreadIds.length,
      styleSamplesCreated: cleanup.styleSampleIds.length,
    };

    try {
      await runPostImportScenePipeline(cleanup.sceneIds);
    } catch (pipelineError) {
      console.error("post-import scene pipeline failed:", pipelineError);
    }

    return result;
  } catch (error) {
    await cleanupFailedImport(cleanup);
    throw error;
  }
}

async function validateCommitReferences(
  payload: ImportCommitPayload,
  projectId: string,
): Promise<void> {
  const supabase = await supabaseServer();
  const [{ data: characters, error: characterError }, { data: beats, error: beatError }] =
    await Promise.all([
      supabase.from("characters").select("id, name, aliases").eq("project_id", projectId),
      supabase.from("beats").select("id").eq("project_id", projectId),
    ]);
  if (characterError) throw characterError;
  if (beatError) throw beatError;

  const beatIds = new Set((beats ?? []).map((beat) => beat.id));

  for (const character of payload.review.characters) {
    if (!character.match.existingId) continue;
    const importedNames = [character.name, ...character.aliases].map(normalizeImportName);
    const validMatch = (characters ?? []).some((row) => {
      if (row.id !== character.match.existingId) return false;
      return [
        row.name ?? "",
        ...((row.aliases ?? []) as string[]),
      ].some((name) => importedNames.includes(normalizeImportName(name)));
    });
    if (!validMatch) {
      throw new Error("Import review references a character outside this project.");
    }
  }

  for (const scene of payload.review.scenes) {
    for (const beatId of scene.beatIds) {
      if (!beatIds.has(beatId)) {
        throw new Error("Import review references a beat outside this project.");
      }
    }
  }
}

function normalizeImportName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

async function resolveImportChapter(
  payload: ImportCommitPayload,
  projectId: string,
): Promise<{ id: string; created: boolean }> {
  const supabase = await supabaseServer();
  if (payload.placement.mode === "existing_chapter") {
    const { data: chapter, error } = await supabase
      .from("chapters")
      .select("id")
      .eq("id", payload.placement.chapterId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) throw error;
    if (!chapter?.id) throw new Error("Selected chapter was not found.");
    return { id: chapter.id, created: false };
  }

  const { data: existingChapters, error: existingChaptersError } = await supabase
    .from("chapters")
    .select("order_index")
    .eq("project_id", projectId);
  if (existingChaptersError) throw existingChaptersError;
  const nextOrder = (existingChapters ?? []).reduce(
    (max, chapter) => Math.max(max, (chapter.order_index ?? -1) + 1),
    0,
  );
  const beatIds = Array.from(
    new Set(payload.review.scenes.flatMap((scene) => scene.beatIds)),
  );
  const { data: chapter, error } = await supabase
    .from("chapters")
    .insert({
      project_id: projectId,
      order_index: nextOrder,
      title: payload.placement.title?.trim() || payload.review.chapterTitle,
      beat_ids: beatIds,
      status: "drafting" as const,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: chapter.id, created: true };
}

async function cleanupFailedImport(cleanup: {
  chapterId: string | null;
  sceneIds: string[];
  characterIds: string[];
  worldElementIds: string[];
  openThreadIds: string[];
  styleSampleIds: string[];
}): Promise<void> {
  const supabase = await supabaseServer();
  try {
    if (cleanup.openThreadIds.length > 0) {
      await supabase.from("open_threads").delete().in("id", cleanup.openThreadIds);
    }
    if (cleanup.styleSampleIds.length > 0) {
      await supabase.from("style_samples").delete().in("id", cleanup.styleSampleIds);
    }
    if (cleanup.sceneIds.length > 0) {
      await supabase.from("scenes").delete().in("id", cleanup.sceneIds);
    }
    if (cleanup.chapterId) {
      await supabase.from("chapters").delete().eq("id", cleanup.chapterId);
    }
    if (cleanup.worldElementIds.length > 0) {
      await supabase.from("world_elements").delete().in("id", cleanup.worldElementIds);
    }
    if (cleanup.characterIds.length > 0) {
      await supabase.from("characters").delete().in("id", cleanup.characterIds);
    }
  } catch (cleanupError) {
    console.error("cleanupFailedImport failed:", cleanupError);
  }
}
