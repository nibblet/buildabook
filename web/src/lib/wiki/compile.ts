import { logAiActivity } from "@/lib/ai/log";
import { compileCharacter } from "@/lib/wiki/compilers/character";
import { compileRelationship } from "@/lib/wiki/compilers/relationship";
import {
  compileStorylineIndex,
  compileThreadsIndex,
  type StorylineChapter,
} from "@/lib/wiki/compilers/indexes";
import { compileWorldElement } from "@/lib/wiki/compilers/world";
import { upsertDoc } from "@/lib/wiki/repo";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  Beat,
  Character,
  OpenThread,
  Relationship,
  Scene,
  WorldElement,
} from "@/lib/supabase/types";

type ChapterRow = {
  id: string;
  title: string | null;
  order_index: number | null;
  status: string;
  wordcount: number;
  synopsis: string | null;
};

type SceneRow = Pick<
  Scene,
  | "id"
  | "chapter_id"
  | "order_index"
  | "title"
  | "goal"
  | "conflict"
  | "outcome"
  | "status"
>;

type CharMentionRow = {
  character_id: string;
  chapter_id: string;
  scene_id: string | null;
  mention_count: number;
};

type ElementMentionRow = {
  element_id: string;
  chapter_id: string;
  scene_id: string | null;
  mention_count: number;
};

type RelationshipBeatRow = {
  relationship_id: string;
  chapter_id: string | null;
  scene_id: string | null;
  beat_label: string | null;
  intensity: number | null;
  notes: string | null;
};

export type CompileReport = {
  characters: { inserted: number; skipped: number };
  world: { inserted: number; skipped: number };
  relationships: { inserted: number; skipped: number };
  threads: "inserted" | "skipped";
  storyline: "inserted" | "skipped";
};

export async function compileProjectWiki(
  projectId: string,
): Promise<CompileReport> {
  const supabase = await supabaseServer();

  const [
    { data: characters },
    { data: worldRows },
    { data: threads },
    { data: relationships },
    { data: beats },
    { data: chapters },
    { data: scenes },
    { data: charMentions },
    { data: elMentions },
    { data: relBeats },
  ] = await Promise.all([
    supabase.from("characters").select("*").eq("project_id", projectId),
    supabase.from("world_elements").select("*").eq("project_id", projectId),
    supabase.from("open_threads").select("*").eq("project_id", projectId),
    supabase.from("relationships").select("*").eq("project_id", projectId),
    supabase
      .from("beats")
      .select("*")
      .eq("project_id", projectId)
      .order("order_index"),
    supabase
      .from("chapters")
      .select("id,title,order_index,status,wordcount,synopsis")
      .eq("project_id", projectId)
      .order("order_index"),
    supabase
      .from("scenes")
      .select("id,chapter_id,order_index,title,goal,conflict,outcome,status")
      .order("order_index"),
    supabase.from("character_mentions").select("*"),
    supabase.from("element_mentions").select("*"),
    supabase.from("relationship_beats").select("*"),
  ]);

  const chars = (characters ?? []) as Character[];
  const worldEls = (worldRows ?? []) as WorldElement[];
  const threadRows = (threads ?? []) as OpenThread[];
  const rels = (relationships ?? []) as Relationship[];
  const beatRows = (beats ?? []) as Beat[];
  const chapterRows = (chapters ?? []) as ChapterRow[];
  const sceneRows = (scenes ?? []) as SceneRow[];
  const charMentionRows = (charMentions ?? []) as CharMentionRow[];
  const elMentionRows = (elMentions ?? []) as ElementMentionRow[];
  const relBeatRows = (relBeats ?? []) as RelationshipBeatRow[];

  const chapterById = new Map(chapterRows.map((c) => [c.id, c]));
  const scenesByChapter = new Map<string, SceneRow[]>();
  for (const s of sceneRows) {
    const arr = scenesByChapter.get(s.chapter_id) ?? [];
    arr.push(s);
    scenesByChapter.set(s.chapter_id, arr);
  }
  const scenesById = new Map(sceneRows.map((s) => [s.id, s]));

  const charById = new Map(chars.map((c) => [c.id, c]));

  const report: CompileReport = {
    characters: { inserted: 0, skipped: 0 },
    world: { inserted: 0, skipped: 0 },
    relationships: { inserted: 0, skipped: 0 },
    threads: "skipped",
    storyline: "skipped",
  };

  for (const c of chars) {
    const appearances = charMentionRows
      .filter((m) => m.character_id === c.id)
      .map((m) => {
        const chapter = chapterById.get(m.chapter_id);
        return {
          scene_id: m.scene_id ?? "",
          chapter_id: m.chapter_id,
          chapter_order: chapter?.order_index ?? 0,
          scene_order: 0,
          chapter_title: chapter?.title ?? null,
          goal: null,
          conflict: null,
          outcome: null,
        };
      });

    const charRels = rels
      .filter((r) => r.char_a_id === c.id || r.char_b_id === c.id)
      .map((r) => {
        const otherId = r.char_a_id === c.id ? r.char_b_id : r.char_a_id;
        const other = otherId ? charById.get(otherId) : null;
        return {
          other_name: other?.name ?? "Unknown",
          type: r.type,
          current_state: r.current_state,
        };
      });

    const compiled = compileCharacter({
      character: c,
      appearances,
      relationships: charRels,
      beats: beatRows.map((b) => ({
        title: b.title,
        act: b.act,
        why_it_matters: b.why_it_matters,
      })),
    });

    const res = await upsertDoc(projectId, "character", c.id, compiled, null);
    if (res.action === "inserted") report.characters.inserted++;
    else report.characters.skipped++;
  }

  for (const w of worldEls) {
    const citations = elMentionRows
      .filter((m) => m.element_id === w.id)
      .map((m) => {
        const chapter = chapterById.get(m.chapter_id);
        return {
          scene_id: m.scene_id ?? "",
          chapter_id: m.chapter_id,
          chapter_order: chapter?.order_index ?? 0,
          scene_order: 0,
          chapter_title: chapter?.title ?? null,
          mention_count: m.mention_count,
        };
      });

    const compiled = compileWorldElement({ element: w, citations });
    const res = await upsertDoc(projectId, "world", w.id, compiled, null);
    if (res.action === "inserted") report.world.inserted++;
    else report.world.skipped++;
  }

  for (const r of rels) {
    const aId = r.char_a_id;
    const bId = r.char_b_id;
    const a = aId ? charById.get(aId) : null;
    const b = bId ? charById.get(bId) : null;

    const beatsForRel = relBeatRows
      .filter((rb) => rb.relationship_id === r.id)
      .map((rb) => {
        const chapter = rb.chapter_id ? chapterById.get(rb.chapter_id) : null;
        const scene = rb.scene_id ? scenesById.get(rb.scene_id) : null;
        return {
          chapter_order: chapter?.order_index ?? 0,
          scene_order: scene?.order_index ?? 0,
          chapter_title: chapter?.title ?? null,
          beat_label: rb.beat_label,
          intensity: rb.intensity,
          notes: rb.notes,
        };
      });

    const compiled = compileRelationship({
      relationship: r,
      charA: a ? { id: a.id, name: a.name } : null,
      charB: b ? { id: b.id, name: b.name } : null,
      beats: beatsForRel,
    });

    const res = await upsertDoc(projectId, "relationship", r.id, compiled, null);
    if (res.action === "inserted") report.relationships.inserted++;
    else report.relationships.skipped++;
  }

  const threadRowsView = threadRows.map((t) => ({
    id: t.id,
    question: t.question,
    resolved: t.resolved,
    opened_chapter_title:
      (t.opened_in_chapter_id
        ? chapterById.get(t.opened_in_chapter_id)?.title
        : null) ?? null,
    resolved_chapter_title:
      (t.resolved_in_chapter_id
        ? chapterById.get(t.resolved_in_chapter_id)?.title
        : null) ?? null,
  }));
  const threadsDoc = compileThreadsIndex({ threads: threadRowsView });
  const threadsRes = await upsertDoc(
    projectId,
    "index",
    "threads",
    threadsDoc,
    null,
  );
  report.threads = threadsRes.action === "inserted" ? "inserted" : "skipped";

  const storylineChapters: StorylineChapter[] = chapterRows.map((c) => ({
    id: c.id,
    title: c.title,
    order: c.order_index ?? 0,
    status: c.status,
    wordcount: c.wordcount,
    synopsis: c.synopsis,
    scenes: (scenesByChapter.get(c.id) ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      order: s.order_index ?? 0,
      goal: s.goal,
      status: s.status,
    })),
  }));
  const storylineDoc = compileStorylineIndex({
    chapters: storylineChapters,
    beats: beatRows.map((b) => ({
      title: b.title,
      act: b.act,
      why_it_matters: b.why_it_matters,
    })),
  });
  const storylineRes = await upsertDoc(
    projectId,
    "index",
    "storyline",
    storylineDoc,
    null,
  );
  report.storyline = storylineRes.action === "inserted" ? "inserted" : "skipped";

  await logAiActivity({
    projectId,
    kind: "compile.project",
    summary: `Compiled wiki: ${report.characters.inserted} chars / ${report.world.inserted} world / ${report.relationships.inserted} rels / threads=${report.threads} / storyline=${report.storyline}`,
    detail: report as unknown as Record<string, unknown>,
  });

  return report;
}
