"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { extractDraft, type ExtractedDraftT } from "@/lib/ai/extract";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import { countWords } from "@/lib/utils";
import type { Beat } from "@/lib/supabase/types";

// Step 1 of onboarding: run extraction on the pasted draft.
export async function runExtraction(draftText: string): Promise<{
  ok: boolean;
  data?: ExtractedDraftT;
  error?: string;
}> {
  try {
    const project = await getOrCreateProject();
    if (!project) return { ok: false, error: "No active project." };
    const data = await extractDraft(draftText, {
      projectId: project.id,
      writingProfile: parseWritingProfile(project.writing_profile),
    });
    return { ok: true, data };
  } catch (err) {
    console.error("runExtraction failed:", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Extraction failed. Try shortening the draft or retrying.",
    };
  }
}

type ApprovedReview = {
  title?: string | null;
  premise?: string | null;
  styleNotes?: string | null;
  paranormalType?: string | null;
  heatLevel?: string | null;
  targetWordcount?: number | null;
  tropes: string[];
  characters: Array<{
    name: string;
    role?: string | null;
    species?: string | null;
    archetype?: string | null;
    voice_notes?: string | null;
    powers?: string | null;
    backstory?: string | null;
    aliases?: string[];
  }>;
  worldElements: Array<{
    category: string;
    name: string;
    description: string;
  }>;
  scenes: Array<{
    order_index: number;
    pov_character_name?: string | null;
    goal?: string | null;
    conflict?: string | null;
    outcome?: string | null;
    content: string;
    beats_covered?: string[];
  }>;
  beatsCovered: string[];
  openThreads: Array<{ question: string }>;
  styleSample?: { label: string; content: string } | null;
  chapterTitle?: string | null;
};

// Step 2: commit the approved review payload to the database.
export async function commitOnboarding(payload: ApprovedReview) {
  const supabase = await supabaseServer();
  const project = await getOrCreateProject();
  if (!project) throw new Error("No active project.");

  // 1. Update project with premise/style/paranormal_type/etc.
  const projectUpdate: Record<string, unknown> = {};
  if (payload.title) projectUpdate.title = payload.title;
  if (payload.premise !== undefined) projectUpdate.premise = payload.premise;
  if (payload.styleNotes !== undefined)
    projectUpdate.style_notes = payload.styleNotes;
  if (payload.paranormalType)
    projectUpdate.paranormal_type = payload.paranormalType;
  if (payload.heatLevel) projectUpdate.heat_level = payload.heatLevel;
  if (payload.targetWordcount)
    projectUpdate.target_wordcount = payload.targetWordcount;

  if (Object.keys(projectUpdate).length > 0) {
    const { error } = await supabase
      .from("projects")
      .update(projectUpdate)
      .eq("id", project.id);
    if (error) throw error;
  }

  // 2. Tropes
  if (payload.tropes.length > 0) {
    await supabase
      .from("project_tropes")
      .delete()
      .eq("project_id", project.id);
    await supabase.from("project_tropes").insert(
      payload.tropes.map((t) => ({ project_id: project.id, trope: t })),
    );
  }

  // 3. Characters (get back a name→id map)
  const charNameToId: Record<string, string> = {};
  if (payload.characters.length > 0) {
    const { data: insertedChars, error: charErr } = await supabase
      .from("characters")
      .insert(
        payload.characters.map((c) => ({
          project_id: project.id,
          name: c.name,
          role: c.role ?? null,
          species: c.species ?? null,
          archetype: c.archetype ?? null,
          voice_notes: c.voice_notes ?? null,
          powers: c.powers ?? null,
          backstory: c.backstory ?? null,
          aliases: c.aliases ?? [],
        })),
      )
      .select("id, name");
    if (charErr) throw charErr;
    for (const c of insertedChars ?? []) {
      charNameToId[c.name] = c.id;
    }
  }

  // 4. World elements
  if (payload.worldElements.length > 0) {
    const { error: weErr } = await supabase.from("world_elements").insert(
      payload.worldElements.map((w) => ({
        project_id: project.id,
        category: w.category,
        name: w.name,
        description: w.description,
      })),
    );
    if (weErr) throw weErr;
  }

  // 5. Open threads
  if (payload.openThreads.length > 0) {
    await supabase.from("open_threads").insert(
      payload.openThreads.map((t) => ({
        project_id: project.id,
        question: t.question,
      })),
    );
  }

  // 6. Style sample
  if (payload.styleSample && payload.styleSample.content.trim()) {
    await supabase.from("style_samples").insert({
      project_id: project.id,
      label: payload.styleSample.label || "opening",
      content: payload.styleSample.content,
      is_default: true,
    });
  }

  // 7. Chapter 1 + scenes
  // Map beat_type → beat.id
  const { data: beatRows } = await supabase
    .from("beats")
    .select("id, beat_type, order_index")
    .eq("project_id", project.id)
    .order("order_index", { ascending: true });
  const beatTypeToId = new Map<string, string>();
  for (const b of (beatRows ?? []) as Pick<
    Beat,
    "id" | "beat_type" | "order_index"
  >[]) {
    if (b.beat_type) beatTypeToId.set(b.beat_type, b.id);
  }

  const chapterBeatIds = payload.beatsCovered
    .map((bt) => beatTypeToId.get(bt))
    .filter(Boolean) as string[];

  const chapterPov =
    payload.characters[0]?.name && charNameToId[payload.characters[0].name]
      ? charNameToId[payload.characters[0].name]
      : null;

  const { data: chapter, error: chapErr } = await supabase
    .from("chapters")
    .insert({
      project_id: project.id,
      order_index: 0,
      title: payload.chapterTitle || "Chapter 1",
      pov_character_id: chapterPov,
      beat_ids: chapterBeatIds,
      status: "drafting",
    })
    .select("*")
    .single();
  if (chapErr) throw chapErr;

  // Scenes
  if (payload.scenes.length > 0) {
    const sceneRows = payload.scenes.map((s, idx) => {
      const povName = s.pov_character_name ?? payload.characters[0]?.name ?? null;
      const povId = povName ? (charNameToId[povName] ?? null) : null;
      const sceneBeatIds = (s.beats_covered ?? [])
        .map((bt) => beatTypeToId.get(bt))
        .filter(Boolean) as string[];
      return {
        chapter_id: chapter.id,
        order_index: typeof s.order_index === "number" ? s.order_index : idx,
        pov_character_id: povId,
        goal: s.goal ?? null,
        conflict: s.conflict ?? null,
        outcome: s.outcome ?? null,
        content: s.content,
        wordcount: countWords(s.content),
        beat_ids: sceneBeatIds,
        status: "drafting" as const,
      };
    });
    const { error: sceneErr } = await supabase.from("scenes").insert(sceneRows);
    if (sceneErr) throw sceneErr;
  }

  // Update chapter wordcount
  const totalWc = payload.scenes.reduce(
    (sum, s) => sum + countWords(s.content),
    0,
  );
  await supabase
    .from("chapters")
    .update({ wordcount: totalWc })
    .eq("id", chapter.id);

  revalidatePath("/");
  redirect("/");
}
