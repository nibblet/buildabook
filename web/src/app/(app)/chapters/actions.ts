"use server";

import { revalidatePath } from "next/cache";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { runChapterFactCheck } from "@/lib/ai/chapter-fact-check";
import { runChapterDebrief } from "@/lib/ai/chapter-debrief";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { askModel, resolveModelFromProject } from "@/lib/ai/model";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";

export async function runChapterFactCheckAction(chapterId: string) {
  const res = await runChapterFactCheck(chapterId);
  revalidatePath(`/chapters/${chapterId}`);
  return res;
}

export async function runChapterDebriefAction(chapterId: string) {
  const res = await runChapterDebrief(chapterId);
  return res;
}

export type BulkAddResult = {
  createdCount: number;
  aiExpanded: boolean;
};

export async function bulkAddScenesToChapter(
  chapterId: string,
  titles: string[],
  opts: { aiExpand: boolean },
): Promise<BulkAddResult> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const clean = titles
    .map((t) => t.replace(/^[\s\-\*•–]+/, "").trim())
    .filter((t) => t.length > 0)
    .slice(0, 50);
  if (clean.length === 0) throw new Error("No titles provided.");

  const supabase = await supabaseServer();
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, synopsis, project_id, pov_character_id")
    .eq("id", chapterId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!chapter) throw new Error("Chapter not found.");

  const { data: existing } = await supabase
    .from("scenes")
    .select("order_index")
    .eq("chapter_id", chapterId);
  const startOrder = (existing ?? []).reduce(
    (max, s) => Math.max(max, (s.order_index ?? -1) + 1),
    0,
  );

  let expansions: Array<{
    goal: string | null;
    conflict: string | null;
    outcome: string | null;
  } | null> = clean.map(() => null);

  if (opts.aiExpand) {
    try {
      expansions = await expandTitles(clean, chapter, project.writing_profile);
    } catch (e) {
      // If expansion fails, fall back to title-only insert.
      console.error("bulkAddScenes expand failed:", e);
    }
  }

  const rows = clean.map((title, idx) => {
    const ex = expansions[idx] ?? null;
    return {
      chapter_id: chapterId,
      order_index: startOrder + idx,
      title,
      pov_character_id: chapter.pov_character_id ?? null,
      goal: ex?.goal ?? null,
      conflict: ex?.conflict ?? null,
      outcome: ex?.outcome ?? null,
      status: "planned" as const,
      wordcount: 0,
    };
  });

  const { error } = await supabase.from("scenes").insert(rows);
  if (error) throw error;

  revalidatePath(`/chapters/${chapterId}`);
  revalidatePath("/outline");
  revalidatePath("/plan");
  revalidatePath("/");

  return { createdCount: rows.length, aiExpanded: opts.aiExpand };
}

const ExpansionSchema = z.array(
  z.object({
    goal: z.string().optional().nullable(),
    conflict: z.string().optional().nullable(),
    outcome: z.string().optional().nullable(),
  }),
);

async function expandTitles(
  titles: string[],
  chapter: { title: string | null; synopsis: string | null },
  writingProfile: string | null,
): Promise<
  Array<{ goal: string | null; conflict: string | null; outcome: string | null }>
> {
  const wp = parseWritingProfile(writingProfile);
  const model = resolveModelFromProject(wp, "quick");
  const system = `You are a story-structure assistant. Given a list of scene titles in a chapter, return a goal / conflict / outcome for each.

Be faithful to the title and chapter context — do not invent unrelated plot. Keep each field short (one sentence).

Return ONLY valid JSON: an array of objects with keys "goal", "conflict", "outcome". Same length and order as the input titles. No commentary.`;

  const user = `Chapter: ${chapter.title ?? "(untitled)"}
${chapter.synopsis ? `Synopsis: ${chapter.synopsis}` : ""}

Scene titles (${titles.length}):
${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Return: [{ "goal": "...", "conflict": "...", "outcome": "..." }, ...]`;

  const { text } = await askModel({
    persona: "analyst",
    system,
    user,
    model,
    temperature: 0.5,
    maxTokens: 1500,
    writingProfile: wp,
    contextType: "bulk_scene_expand",
  });

  const parsed = parseJsonArray(text);
  const arr = ExpansionSchema.parse(parsed);

  return titles.map((_, i) => {
    const ex = arr[i];
    if (!ex)
      return { goal: null, conflict: null, outcome: null };
    return {
      goal: ex.goal ?? null,
      conflict: ex.conflict ?? null,
      outcome: ex.outcome ?? null,
    };
  });
}

function parseJsonArray(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array in response.");
  const candidate = stripped.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(jsonrepair(candidate));
  }
}
