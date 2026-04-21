"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import {
  proposeFromNotes,
  type Proposal,
  ProposalSchema,
} from "@/lib/ai/extract-notes";

export type ScratchpadRow = {
  id: string;
  content: string;
  last_proposal: Proposal | null;
  last_promoted_at: string | null;
  updated_at: string;
};

export async function getOrCreateScratchpad(): Promise<ScratchpadRow> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();

  const { data: existing } = await supabase
    .from("project_notes")
    .select("id, content, last_proposal, last_promoted_at, updated_at")
    .eq("project_id", project.id)
    .eq("kind", "scratchpad")
    .maybeSingle();
  if (existing) {
    return existing as ScratchpadRow;
  }

  const { data: created, error } = await supabase
    .from("project_notes")
    .insert({ project_id: project.id, kind: "scratchpad", content: "" })
    .select("id, content, last_proposal, last_promoted_at, updated_at")
    .single();
  if (error) throw error;
  return created as ScratchpadRow;
}

export async function saveScratchpad(content: string): Promise<void> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("project_notes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("project_id", project.id)
    .eq("kind", "scratchpad");
  if (error) throw error;

  revalidatePath("/scratchpad");
}

export async function proposeFromScratchpad(): Promise<Proposal> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const supabase = await supabaseServer();

  const [{ data: row }, { data: beats }, { data: chapters }, { data: chars }] =
    await Promise.all([
      supabase
        .from("project_notes")
        .select("content")
        .eq("project_id", project.id)
        .eq("kind", "scratchpad")
        .maybeSingle(),
      supabase
        .from("beats")
        .select("title")
        .eq("project_id", project.id),
      supabase
        .from("chapters")
        .select("title")
        .eq("project_id", project.id),
      supabase
        .from("characters")
        .select("name")
        .eq("project_id", project.id),
    ]);

  const notes = (row?.content ?? "").trim();
  if (!notes) {
    throw new Error("Scratchpad is empty — write some notes first.");
  }

  const proposal = await proposeFromNotes(
    notes,
    {
      existingBeatTitles: (beats ?? [])
        .map((b) => b.title)
        .filter((t): t is string => !!t),
      existingChapterTitles: (chapters ?? [])
        .map((c) => c.title)
        .filter((t): t is string => !!t),
      existingCharacterNames: (chars ?? [])
        .map((c) => c.name)
        .filter((n): n is string => !!n),
    },
    { projectId: project.id, writingProfile: project.writing_profile },
  );

  await supabase
    .from("project_notes")
    .update({ last_proposal: proposal })
    .eq("project_id", project.id)
    .eq("kind", "scratchpad");

  revalidatePath("/scratchpad");
  return proposal;
}

export type PromoteSelection = {
  beatKeys: string[];
  characterKeys: string[];
  chapterKeys: string[];
  sceneKeys: string[];
};

export type PromoteResult = {
  beatsCreated: number;
  charactersCreated: number;
  chaptersCreated: number;
  scenesCreated: number;
};

export async function promoteProposal(
  proposal: Proposal,
  selection: PromoteSelection,
): Promise<PromoteResult> {
  const project = await getOrCreateProject();
  if (!project) throw new Error("No project.");
  const parsed = ProposalSchema.parse(proposal);
  const supabase = await supabaseServer();

  const beatKeySet = new Set(selection.beatKeys);
  const charKeySet = new Set(selection.characterKeys);
  const chapterKeySet = new Set(selection.chapterKeys);
  const sceneKeySet = new Set(selection.sceneKeys);

  // 1. Characters
  const charKeyToId = new Map<string, string>();
  const charNameToId = new Map<string, string>();
  const chosenChars = parsed.characters.filter((c) => charKeySet.has(c.key));
  if (chosenChars.length > 0) {
    const { data: inserted, error } = await supabase
      .from("characters")
      .insert(
        chosenChars.map((c) => ({
          project_id: project.id,
          name: c.name,
          role: c.role ?? null,
          archetype: c.archetype ?? null,
          wound: c.wound ?? null,
          desire: c.desire ?? null,
          need: c.need ?? null,
          voice_notes: c.voice_notes ?? null,
        })),
      )
      .select("id, name");
    if (error) throw error;
    for (let i = 0; i < (inserted ?? []).length; i++) {
      const row = (inserted ?? [])[i]!;
      const src = chosenChars[i]!;
      charKeyToId.set(src.key, row.id);
      charNameToId.set(row.name, row.id);
    }
  }

  // Also learn existing character name → id so proposed chapters can set POV.
  const { data: existingChars } = await supabase
    .from("characters")
    .select("id, name")
    .eq("project_id", project.id);
  for (const c of existingChars ?? []) {
    if (!charNameToId.has(c.name)) charNameToId.set(c.name, c.id);
  }

  // 2. Beats
  const beatKeyToId = new Map<string, string>();
  const chosenBeats = parsed.beats.filter((b) => beatKeySet.has(b.key));
  if (chosenBeats.length > 0) {
    const { data: existingBeats } = await supabase
      .from("beats")
      .select("order_index")
      .eq("project_id", project.id);
    const startOrder = (existingBeats ?? []).reduce(
      (max, b) => Math.max(max, (b.order_index ?? -1) + 1),
      0,
    );
    const { data: inserted, error } = await supabase
      .from("beats")
      .insert(
        chosenBeats.map((b, idx) => ({
          project_id: project.id,
          order_index: startOrder + idx,
          act: b.act ?? 1,
          title: b.title,
          description: b.description ?? null,
          why_it_matters: b.why_it_matters ?? null,
        })),
      )
      .select("id");
    if (error) throw error;
    for (let i = 0; i < (inserted ?? []).length; i++) {
      beatKeyToId.set(chosenBeats[i]!.key, (inserted ?? [])[i]!.id);
    }
  }

  // Existing beat title → id for proposed chapters that reference existing beats.
  const beatTitleToId = new Map<string, string>();
  const { data: allBeats } = await supabase
    .from("beats")
    .select("id, title")
    .eq("project_id", project.id);
  for (const b of allBeats ?? []) {
    if (b.title) beatTitleToId.set(b.title, b.id);
  }

  // 3. Chapters
  const chapterKeyToId = new Map<string, string>();
  const chapterTitleToId = new Map<string, string>();
  const chosenChapters = parsed.chapters.filter((c) => chapterKeySet.has(c.key));
  if (chosenChapters.length > 0) {
    const { data: existingChapters } = await supabase
      .from("chapters")
      .select("order_index, title")
      .eq("project_id", project.id);
    for (const c of existingChapters ?? []) {
      if (c.title) chapterTitleToId.set(c.title, "");
    }
    const startOrder = (existingChapters ?? []).reduce(
      (max, c) => Math.max(max, (c.order_index ?? -1) + 1),
      0,
    );
    const { data: inserted, error } = await supabase
      .from("chapters")
      .insert(
        chosenChapters.map((c, idx) => {
          const pov = c.pov_character_name
            ? (charNameToId.get(c.pov_character_name) ?? null)
            : null;
          const beatIds = (c.beat_keys ?? [])
            .map((k) => beatKeyToId.get(k))
            .filter((v): v is string => !!v);
          return {
            project_id: project.id,
            order_index: startOrder + idx,
            title: c.title,
            synopsis: c.synopsis ?? null,
            pov_character_id: pov,
            beat_ids: beatIds,
            status: "planned" as const,
          };
        }),
      )
      .select("id, title");
    if (error) throw error;
    for (let i = 0; i < (inserted ?? []).length; i++) {
      const row = (inserted ?? [])[i]!;
      chapterKeyToId.set(chosenChapters[i]!.key, row.id);
      if (row.title) chapterTitleToId.set(row.title, row.id);
    }
  }

  // Learn existing chapter titles too.
  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id, title")
    .eq("project_id", project.id);
  for (const c of allChapters ?? []) {
    if (c.title && !chapterTitleToId.get(c.title))
      chapterTitleToId.set(c.title, c.id);
  }

  // 4. Scenes — each scene must resolve to a chapter.
  let scenesCreated = 0;
  const chosenScenes = parsed.scenes.filter((s) => sceneKeySet.has(s.key));
  if (chosenScenes.length > 0) {
    // Group scenes by resolved chapter id for per-chapter order.
    const byChapter = new Map<string, typeof chosenScenes>();
    for (const s of chosenScenes) {
      const chapterId = s.chapter_key
        ? chapterKeyToId.get(s.chapter_key)
        : s.chapter_title
          ? chapterTitleToId.get(s.chapter_title)
          : undefined;
      if (!chapterId) continue;
      const bucket = byChapter.get(chapterId) ?? [];
      bucket.push(s);
      byChapter.set(chapterId, bucket);
    }

    for (const [chapterId, scenes] of byChapter) {
      const { data: existingScenes } = await supabase
        .from("scenes")
        .select("order_index")
        .eq("chapter_id", chapterId);
      const startOrder = (existingScenes ?? []).reduce(
        (max, s) => Math.max(max, (s.order_index ?? -1) + 1),
        0,
      );
      const { error } = await supabase.from("scenes").insert(
        scenes.map((s, idx) => ({
          chapter_id: chapterId,
          order_index: startOrder + idx,
          title: s.title,
          goal: s.goal ?? null,
          conflict: s.conflict ?? null,
          outcome: s.outcome ?? null,
          status: "planned" as const,
          wordcount: 0,
        })),
      );
      if (error) throw error;
      scenesCreated += scenes.length;
    }
  }

  await supabase
    .from("project_notes")
    .update({ last_promoted_at: new Date().toISOString() })
    .eq("project_id", project.id)
    .eq("kind", "scratchpad");

  revalidatePath("/scratchpad");
  revalidatePath("/spine");
  revalidatePath("/outline");
  revalidatePath("/plan");
  revalidatePath("/");

  return {
    beatsCreated: chosenBeats.length,
    charactersCreated: chosenChars.length,
    chaptersCreated: chosenChapters.length,
    scenesCreated,
  };
}
