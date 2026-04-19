"use server";

import { revalidatePath } from "next/cache";
import { askClaude, resolveModelKey } from "@/lib/ai/claude";
import { getPersonas } from "@/lib/ai/personas";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import { env } from "@/lib/env";
import { getOrCreateProject } from "@/lib/projects";
import { loadSpine, pickCurrentScene, type SpineData } from "@/lib/spine";
import type { Scene } from "@/lib/supabase/types";
import { supabaseServer } from "@/lib/supabase/server";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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

  let summaryText = fallbackSummary(spine, scene);

  const apiKey = env.anthropicApiKey();
  if (apiKey) {
    try {
      const user = buildWrapPrompt(spine, scene);
      const profiler = getPersonas(parseWritingProfile(project.writing_profile))
        .profiler;
      const result = await askClaude({
        persona: "profiler",
        system: `${profiler.directive}\n\nFor THIS task only: ignore questions. Reply with exactly two sentences in past tense. Summarize what the writer worked on this session and where the story stands (scene goal/tension). No headings, bullets, or greeting.`,
        user: `Session wrap for continuity dashboard:\n\n${user}`,
        model: resolveModelKey("quick"),
        temperature: 0.35,
        maxTokens: 220,
        projectId: project.id,
        contextType: "session_wrap",
        contextId: scene?.id ?? null,
      });
      const t = result.text.trim().replace(/\s+/g, " ");
      if (t.length > 20) summaryText = t;
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
