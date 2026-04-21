"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import {
  aiReadyForWritingProfile,
  askModel,
  resolveModelFromProject,
} from "@/lib/ai/model";
import { getPersonas } from "@/lib/ai/personas";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import { getOrCreateProject } from "@/lib/projects";
import { getOrGenerateReflection } from "@/lib/ai/reflections";
import { loadSpine, pickCurrentScene, type SpineData } from "@/lib/spine";
import type { Scene } from "@/lib/supabase/types";
import { supabaseServer } from "@/lib/supabase/server";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function sessionSignaturePayload(
  scene: Scene | null,
  writerNote: string | null,
): string {
  if (!scene) return JSON.stringify({ scene: null, writerNote });
  const plain = stripHtml(scene.content ?? "");
  return JSON.stringify({
    sceneId: scene.id,
    wordcount: scene.wordcount ?? 0,
    goal: scene.goal,
    conflict: scene.conflict,
    outcome: scene.outcome,
    proseHash: createHash("sha256").update(plain).digest("hex"),
    writerNote,
  });
}

function buildWrapPrompt(spine: SpineData, scene: Scene | null): string {
  const chapter = scene
    ? spine.chapters.find((c) => c.id === scene.chapter_id)
    : null;
  const beatTitles =
    scene?.beat_ids
      ?.map((id) => spine.beats.find((b) => b.id === id)?.title)
      .filter(Boolean)
      .join(", ") ?? "";

  const prose =
    scene?.content && scene.content.trim()
      ? stripHtml(scene.content).slice(0, 900)
      : "";

  const lines = [
    `Scene: ${scene?.title?.trim() || "(untitled)"}`,
    chapter &&
      `Chapter: ${chapter.title?.trim() || `Chapter ${(chapter.order_index ?? 0) + 1}`}`,
    scene && `Words in scene: ${scene.wordcount ?? 0}`,
    beatTitles && `Beats tagged: ${beatTitles}`,
    scene?.goal && `Goal: ${scene.goal}`,
    scene?.conflict && `Conflict: ${scene.conflict}`,
    scene?.outcome && `Outcome: ${scene.outcome}`,
    prose && `Latest draft excerpt:\n${prose}`,
  ].filter(Boolean);

  return lines.join("\n");
}

function fallbackSummary(spine: SpineData, scene: Scene | null): string {
  if (!scene)
    return "You stepped away from the manuscript — open a scene when you’re ready to continue.";
  const chapter = spine.chapters.find((c) => c.id === scene.chapter_id);
  const chLabel =
    chapter?.title?.trim() ||
    `Chapter ${(chapter?.order_index ?? 0) + 1}`;
  const scLabel =
    scene.title?.trim() ||
    `Scene ${(scene.order_index ?? 0) + 1}`;
  const words = scene.wordcount ?? 0;
  return `Last focus: ${scLabel} in ${chLabel} (${words} words). Continue when you’re ready.`;
}

/** Profiler-generated recap + optional writer note; inserts a `sessions` row. */
export async function wrapWritingSession(writerNoteRaw: string) {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");

  const writerNote = writerNoteRaw.trim() || null;

  const spine = await loadSpine(project.id);
  const scene = pickCurrentScene(spine);

  const wp = parseWritingProfile(project.writing_profile);
  const signature = createHash("sha256")
    .update(sessionSignaturePayload(scene, writerNote))
    .digest("hex");

  let summaryText = fallbackSummary(spine, scene);

  if (aiReadyForWritingProfile(wp)) {
    try {
      summaryText = await getOrGenerateReflection({
        projectId: project.id,
        kind: "session_wrap",
        targetId: scene?.id ?? null,
        newSignature: signature,
        generate: async () => {
          const user = buildWrapPrompt(spine, scene);
          const profiler = getPersonas(wp).profiler;
          const model = resolveModelFromProject(
            project.writing_profile,
            "quick",
          );
          const result = await askModel({
            persona: "reflect_session",
            system: `${profiler.directive}\n\nFor THIS task only: ignore questions. Reply with exactly two sentences in past tense. Summarize what the writer worked on this session and where the story stands (scene goal/tension). No headings, bullets, or greeting.`,
            user: `Session wrap for continuity dashboard:\n\n${user}`,
            model,
            temperature: 0.35,
            maxTokens: 220,
            projectId: project.id,
            contextType: "session_wrap",
            contextId: scene?.id ?? null,
            writingProfile: wp,
          });
          const t = result.text.trim().replace(/\s+/g, " ");
          return {
            body: t.length > 20 ? t : fallbackSummary(spine, scene),
            model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
            aiInteractionId: null,
          };
        },
      });
    } catch (e) {
      console.error("session wrap AI failed:", e);
    }
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.from("sessions").insert({
    project_id: project.id,
    summary: summaryText,
    writer_note: writerNote,
    last_scene_id: scene?.id ?? null,
    last_action: "wrapped",
  });
  if (error) throw error;

  revalidatePath("/");
}
