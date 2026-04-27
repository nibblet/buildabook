"use server";

import { getPersonas } from "@/lib/ai/personas";
import {
  askModel,
  resolveModelFromProject,
} from "@/lib/ai/model";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import { buildContext } from "@/lib/ai/context";
import { fetchContinuityFactsForScene } from "@/lib/ai/continuity/context-block";
import { env } from "@/lib/env";
import { listCurrentDocs } from "@/lib/wiki/repo";
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

function authorInstructionDirective(instruction: string): string {
  return [
    "The author gave this instruction for revising the SELECTION ONLY (follow it; stay consistent with the PROJECT context unless the instruction clearly asks otherwise):",
    instruction,
    "Preserve POV, tense, and voice unless the instruction explicitly requires changing them.",
    "Return ONLY the revised passage — no preamble, quotes, or labels.",
  ].join("\n");
}

/** Replace the current selection with Partner-revised prose (Phase 1 inline toolbar). */
export async function runInlineAssist(input: {
  sceneId: string | null;
  chapterId: string | null;
  selectedText: string;
  mode: InlineAssistMode;
  /** When set and non-empty after trim, overrides preset mode prompts. */
  authorInstruction?: string | null;
}): Promise<{ ok: boolean; text?: string; error?: string }> {
  const trimmed = input.selectedText.trim();
  if (!trimmed)
    return { ok: false, error: "No text selected." };

  try {
    const project = await getOrCreateProject();
    if (!project) return { ok: false, error: "No project." };

    const supabase = await supabaseServer();
    const [{ data: samples }, { data: tropes }, wikiDocsAll] =
      await Promise.all([
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

    let continuityFacts: string | null = null;
    if (input.sceneId && env.continuityEditorEnabled()) {
      continuityFacts = await fetchContinuityFactsForScene(
        supabase,
        project.id,
        currentScene?.content ?? null,
      );
    }

    const base = buildContext({
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
      wikiDocs,
    });

    const persona = getPersonas(parseWritingProfile(project.writing_profile))
      .partner;
    const custom = input.authorInstruction?.trim();
    const task =
      custom && custom.length > 0
        ? authorInstructionDirective(custom)
        : MODE_PROMPTS[input.mode];
    const directive = `\n\n---\n\n${task}`;
    const user = `SELECTION TO REVISE (quoted for clarity — do not include these quote marks in your output):\n"""\n${trimmed}\n"""`;

    const model = resolveModelFromProject(project.writing_profile, persona.model);
    const { text } = await askModel({
      persona: "partner",
      system: base + directive,
      user,
      model,
      temperature: persona.temperature,
      maxTokens: persona.maxTokens,
      projectId: project.id,
      writingProfile: parseWritingProfile(project.writing_profile),
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
