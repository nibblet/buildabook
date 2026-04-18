"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { PERSONAS } from "@/lib/ai/personas";
import { askClaude, resolveModelKey } from "@/lib/ai/claude";
import { buildContext } from "@/lib/ai/context";
import { retrieveRagContinuity } from "@/lib/ai/rag";
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
  personaKey: keyof typeof PERSONAS;
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

    const persona = PERSONAS[input.personaKey];
    if (!persona) return { ok: false, error: "Unknown persona." };

    const supabase = await supabaseServer();

    const [
      { data: chars },
      { data: world },
      { data: threads },
      { data: samples },
      { data: tropes },
    ] = await Promise.all([
      supabase.from("characters").select("*").eq("project_id", project.id),
      supabase.from("world_elements").select("*").eq("project_id", project.id),
      supabase
        .from("open_threads")
        .select("*")
        .eq("project_id", project.id)
        .eq("resolved", false),
      supabase.from("style_samples").select("*").eq("project_id", project.id),
      supabase
        .from("project_tropes")
        .select("trope")
        .eq("project_id", project.id),
    ]);

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

    let ragContinuity: string | null = null;
    if (input.sceneId && currentScene?.content) {
      const plain = currentScene.content
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (plain.length > 55) {
        ragContinuity = await retrieveRagContinuity({
          projectId: project.id,
          excludeSceneId: input.sceneId,
          queryText: plain.slice(0, 1600),
        });
      }
    }

    const system = buildContext({
      project: project as Project,
      tropes: (tropes ?? []).map((t) => t.trope),
      characters: (chars ?? []) as Character[],
      worldElements: (world ?? []) as WorldElement[],
      openThreads: (threads ?? []) as OpenThread[],
      styleSamples: (samples ?? []) as StyleSample[],
      currentBeat,
      currentChapterTitle,
      currentScene,
      ragContinuity,
    });

    const model = resolveModelKey(persona.model);
    const directive = `\n\n---\n\n${persona.directive}`;
    const fullSystem = system + directive;

    const { text } = await askClaude({
      persona: persona.key,
      system: fullSystem,
      user: input.userPrompt,
      model,
      temperature: persona.temperature,
      maxTokens: persona.maxTokens,
      projectId: project.id,
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
