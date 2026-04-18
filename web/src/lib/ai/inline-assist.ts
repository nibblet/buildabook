"use server";

import { PERSONAS } from "@/lib/ai/personas";
import { askClaude, resolveModelKey } from "@/lib/ai/claude";
import { buildContext } from "@/lib/ai/context";
import { retrieveRagContinuity } from "@/lib/ai/rag";
import { getOrCreateProject } from "@/lib/projects";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  Beat,
  Character,
  OpenThread,
  Project,
  Scene,
  StyleSample,
  WorldElement,
} from "@/lib/supabase/types";

export type InlineAssistMode =
  | "rewrite"
  | "expand"
  | "tighten"
  | "describe"
  | "change_pov";

const MODE_PROMPTS: Record<InlineAssistMode, string> = {
  rewrite:
    "Rewrite the SELECTION ONLY to be sharper and clearer in the same POV and voice as the project. Same tense. Return ONLY the rewritten passage — no preamble, quotes, or labels.",
  expand:
    "Expand the SELECTION ONLY with sensory detail and behavior; keep POV deep. Aim for roughly 50% longer. Return ONLY the expanded passage.",
  tighten:
    "Tighten the SELECTION ONLY — remove redundancy while keeping rhythm and voice. Return ONLY the tightened passage.",
  describe:
    "Enrich concrete visual/sensory description in the SELECTION ONLY — still show don't tell from this POV. Return ONLY the revised passage.",
  change_pov:
    "Rewrite the SELECTION ONLY from the OTHER lead's POV (if dual POV project), deep third. If unclear which other character, infer from PROJECT characters. Return ONLY the passage.",
};

/** Replace the current selection with Partner-revised prose (Phase 1 inline toolbar). */
export async function runInlineAssist(input: {
  sceneId: string | null;
  chapterId: string | null;
  selectedText: string;
  mode: InlineAssistMode;
}): Promise<{ ok: boolean; text?: string; error?: string }> {
  const trimmed = input.selectedText.trim();
  if (!trimmed)
    return { ok: false, error: "No text selected." };

  try {
    const project = await getOrCreateProject();
    if (!project) return { ok: false, error: "No project." };

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
      supabase.from("project_tropes").select("trope").eq("project_id", project.id),
    ]);

    let currentScene: Scene | null = null;
    let currentChapterTitle: string | null = null;

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
        .select("title")
        .eq("id", input.chapterId)
        .maybeSingle();
      currentChapterTitle = ch?.title ?? null;
    }

    let currentBeat: Beat | null = null;
    if (currentScene?.beat_ids?.length) {
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

    const base = buildContext({
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

    const persona = PERSONAS.partner;
    const directive = `\n\n---\n\n${MODE_PROMPTS[input.mode]}`;
    const user = `SELECTION TO REVISE (quoted for clarity — do not include these quote marks in your output):\n"""\n${trimmed}\n"""`;

    const model = resolveModelKey(persona.model);
    const { text } = await askClaude({
      persona: "partner",
      system: base + directive,
      user,
      model,
      temperature: persona.temperature,
      maxTokens: persona.maxTokens,
      projectId: project.id,
      contextType: "scene",
      contextId: input.sceneId,
    });

    return { ok: true, text: text.trim() };
  } catch (err) {
    console.error("runInlineAssist:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Assist failed.",
    };
  }
}
