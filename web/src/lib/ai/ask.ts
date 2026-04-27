"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { type CorePersonaKey, getPersonas } from "@/lib/ai/personas";
import {
  askModel,
  resolveModelFromProject,
} from "@/lib/ai/model";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import { buildContext } from "@/lib/ai/context";
import { buildPartnerDraftContext } from "@/lib/ai/draft-context";
import { fetchContinuityFactsForScene } from "@/lib/ai/continuity/context-block";
import { listCurrentDocs } from "@/lib/wiki/repo";
import { env } from "@/lib/env";
import { getOrCreateProject } from "@/lib/projects";
import type {
  Beat,
  Character,
  OpenThread,
  Project,
  Scene,
  StyleSample,
  WorldElement,
} from "@/lib/supabase/types";

type AskInput = {
  personaKey: CorePersonaKey;
  userPrompt: string;
  sceneId?: string | null;
  chapterId?: string | null;
  beatId?: string | null;
};

export async function askPersona(input: AskInput): Promise<{
  ok: boolean;
  text?: string;
  error?: string;
}> {
  try {
    const project = await getOrCreateProject();
    if (!project) return { ok: false, error: "No project." };

    const personas = getPersonas(parseWritingProfile(project.writing_profile));
    const persona = personas[input.personaKey];
    if (!persona) return { ok: false, error: "Unknown persona." };

    const supabase = await supabaseServer();

    const [
      { data: samples },
      { data: tropes },
      wikiDocsAll,
    ] = await Promise.all([
      supabase.from("style_samples").select("*").eq("project_id", project.id),
      supabase
        .from("project_tropes")
        .select("trope")
        .eq("project_id", project.id),
      listCurrentDocs(project.id),
    ]);

    const wikiDocs = wikiDocsAll.map((d) => ({
      doc_type: d.doc_type,
      doc_key: d.doc_key,
      title: d.title,
      body_md: d.body_md,
    }));

    let currentScene: Scene | null = null;
    let currentChapterTitle: string | null = null;
    let currentBeat: Beat | null = null;

    if (input.sceneId) {
      const { data: scene } = await supabase
        .from("scenes")
        .select("*")
        .eq("id", input.sceneId)
        .maybeSingle();
      if (scene) currentScene = scene as Scene;
      if (scene) {
        const { data: ch } = await supabase
          .from("chapters")
          .select("title")
          .eq("id", scene.chapter_id)
          .maybeSingle();
        currentChapterTitle = ch?.title ?? null;
      }
    } else if (input.chapterId) {
      const { data: ch } = await supabase
        .from("chapters")
        .select("*")
        .eq("id", input.chapterId)
        .maybeSingle();
      if (ch) currentChapterTitle = ch.title;
    }

    if (input.beatId) {
      const { data: b } = await supabase
        .from("beats")
        .select("*")
        .eq("id", input.beatId)
        .maybeSingle();
      if (b) currentBeat = b as Beat;
    } else if (currentScene && currentScene.beat_ids?.length) {
      const { data: b } = await supabase
        .from("beats")
        .select("*")
        .eq("id", currentScene.beat_ids[0])
        .maybeSingle();
      if (b) currentBeat = b as Beat;
    }

    let continuityFacts: string | null = null;
    if (input.sceneId && env.continuityEditorEnabled()) {
      continuityFacts = await fetchContinuityFactsForScene(
        supabase,
        project.id,
        currentScene?.content ?? null,
      );
    }

    let draftContext: string | null = null;
    if (persona.key === "partner" && currentScene) {
      const previousScene = await loadPreviousSceneForDraft(
        supabase,
        project.id,
        currentScene,
      );
      draftContext = buildPartnerDraftContext({
        currentScene,
        previousScene,
      });
    }

    const system = buildContext({
      project: project as Project,
      tropes: (tropes ?? []).map((t) => t.trope),
      characters: [] as Character[],
      worldElements: [] as WorldElement[],
      openThreads: [] as OpenThread[],
      styleSamples: (samples ?? []) as StyleSample[],
      currentBeat,
      currentChapterTitle,
      currentScene,
      continuityFacts,
      draftContext,
      wikiDocs,
    });

    const model = resolveModelFromProject(
      project.writing_profile,
      persona.model,
    );
    const directive = `\n\n---\n\n${persona.directive}`;
    const fullSystem = system + directive;

    const { text } = await askModel({
      persona: persona.key,
      system: fullSystem,
      user: input.userPrompt,
      model,
      temperature: persona.temperature,
      maxTokens: persona.maxTokens,
      projectId: project.id,
      writingProfile: parseWritingProfile(project.writing_profile),
      contextType: input.sceneId
        ? "scene"
        : input.chapterId
          ? "chapter"
          : input.beatId
            ? "beat"
            : "freeform",
      contextId: input.sceneId ?? input.chapterId ?? input.beatId ?? null,
    });

    return { ok: true, text };
  } catch (err) {
    console.error("askPersona failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Request failed.",
    };
  }
}

async function loadPreviousSceneForDraft(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  projectId: string,
  currentScene: Scene,
): Promise<Scene | null> {
  try {
    if (currentScene.order_index !== null) {
      const { data: previousInChapter } = await supabase
        .from("scenes")
        .select("*")
        .eq("chapter_id", currentScene.chapter_id)
        .lt("order_index", currentScene.order_index)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousInChapter) return previousInChapter as Scene;
    }

    const { data: chapter } = await supabase
      .from("chapters")
      .select("order_index")
      .eq("id", currentScene.chapter_id)
      .eq("project_id", projectId)
      .maybeSingle();
    const chapterOrder = chapter?.order_index;
    if (typeof chapterOrder !== "number") return null;

    const { data: previousChapters } = await supabase
      .from("chapters")
      .select("id")
      .eq("project_id", projectId)
      .lt("order_index", chapterOrder)
      .order("order_index", { ascending: false })
      .limit(5);

    for (const previousChapter of previousChapters ?? []) {
      const { data: previousScene } = await supabase
        .from("scenes")
        .select("*")
        .eq("chapter_id", previousChapter.id)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousScene) return previousScene as Scene;
    }
  } catch (err) {
    console.error("loadPreviousSceneForDraft failed:", err);
  }

  return null;
}
