import { supabaseServer } from "@/lib/supabase/server";
import type { Beat, Chapter, Scene } from "@/lib/supabase/types";

/** Earliest beat (by order_index) in chapter.beat_ids; unassigned → first beat in book. */
function primaryBeatIdForChapter(chapter: Chapter, beatsAsc: Beat[]): string | null {
  const ids = chapter.beat_ids ?? [];
  if (ids.length === 0) return beatsAsc[0]?.id ?? null;
  let winner: string | null = null;
  let bestOrder = Infinity;
  for (const bid of ids) {
    const beat = beatsAsc.find((x) => x.id === bid);
    const o = beat?.order_index ?? 999;
    if (o < bestOrder) {
      bestOrder = o;
      winner = bid;
    }
  }
  return winner;
}

/** Scene appears under beat B if the scene tags B, or it has no tags and the chapter defaults here. */
function sceneBelongsUnderBeat(
  scene: Scene,
  chapter: Chapter,
  beatId: string,
  beatsAsc: Beat[],
): boolean {
  const ids = scene.beat_ids ?? [];
  if (ids.includes(beatId)) return true;
  if (ids.length === 0 && primaryBeatIdForChapter(chapter, beatsAsc) === beatId)
    return true;
  return false;
}

export type SpineBeat = Beat & { coverage: "empty" | "partial" | "covered" };
export type SpineScene = Scene;
export type SpineChapter = Chapter & { scenes: SpineScene[] };

export type SpineData = {
  beats: SpineBeat[];
  chaptersByBeat: Record<string, SpineChapter[]>;
  chapters: SpineChapter[];
  scenes: SpineScene[];
  totalWordcount: number;
};

export async function loadSpine(projectId: string): Promise<SpineData> {
  const supabase = await supabaseServer();

  const [{ data: beats }, { data: chapters }, { data: scenes }] =
    await Promise.all([
      supabase
        .from("beats")
        .select("*")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true }),
      supabase
        .from("chapters")
        .select("*")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true }),
      supabase
        .from("scenes")
        .select("*, chapters!inner(project_id)")
        .eq("chapters.project_id", projectId)
        .order("order_index", { ascending: true }),
    ]);

  const beatsRaw = (beats ?? []) as Beat[];
  const chaptersRaw = (chapters ?? []) as Chapter[];
  const scenesRaw = ((scenes ?? []) as unknown as (Scene & {
    chapters?: unknown;
  })[]).map((s) => {
    const { chapters: _c, ...rest } = s;
    void _c;
    return rest as Scene;
  });

  const scenesByChapter: Record<string, Scene[]> = {};
  for (const s of scenesRaw) {
    (scenesByChapter[s.chapter_id] ||= []).push(s);
  }

  const chaptersWithScenes: SpineChapter[] = chaptersRaw.map((c) => ({
    ...c,
    scenes: scenesByChapter[c.id] ?? [],
  }));

  // For each beat: is it empty, partial, or covered?
  const beatsOut: SpineBeat[] = beatsRaw.map((b) => {
    const linkedScenes = scenesRaw.filter((s) =>
      (s.beat_ids ?? []).includes(b.id),
    );
    const linkedChapters = chaptersRaw.filter((c) =>
      (c.beat_ids ?? []).includes(b.id),
    );
    const hasAnyContent =
      linkedScenes.some((s) => !!(s.content && s.content.trim())) ||
      linkedChapters.length > 0;
    const anyDrafting = linkedScenes.some((s) => s.status === "drafting");
    const anyDone = linkedScenes.some((s) => s.status === "done");
    let coverage: "empty" | "partial" | "covered" = "empty";
    if (anyDone && !anyDrafting && hasAnyContent) coverage = "covered";
    else if (hasAnyContent || linkedScenes.length > 0 || linkedChapters.length > 0)
      coverage = "partial";
    return { ...b, coverage };
  });

  // Under each beat: chapters that have at least one scene “for” this beat.
  // A scene counts if scene.beat_ids includes the beat, OR the scene is untagged
  // and the chapter’s primary beat is this one (fallback until the writer tags).
  // Tagged scenes only appear under the beats they tag — that’s book progression.
  const chaptersByBeat: Record<string, SpineChapter[]> = {};
  for (const b of beatsOut) {
    chaptersByBeat[b.id] = chaptersWithScenes
      .map((c) => ({
        ...c,
        scenes: c.scenes.filter((s) =>
          sceneBelongsUnderBeat(s, c, b.id, beatsRaw),
        ),
      }))
      .filter((c) => c.scenes.length > 0);
  }

  const totalWordcount = scenesRaw.reduce(
    (sum, s) => sum + (s.wordcount ?? 0),
    0,
  );

  return {
    beats: beatsOut,
    chaptersByBeat,
    chapters: chaptersWithScenes,
    scenes: scenesRaw,
    totalWordcount,
  };
}

// Pick the scene to "continue" — most recently updated drafting scene, else
// most recent scene of any status.
export function pickCurrentScene(data: SpineData): SpineScene | null {
  const drafting = [...data.scenes]
    .filter((s) => s.status === "drafting")
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  if (drafting[0]) return drafting[0];
  const all = [...data.scenes].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
  return all[0] ?? null;
}

export function currentChapterFor(
  data: SpineData,
  scene: SpineScene | null,
): SpineChapter | null {
  if (!scene) return data.chapters[0] ?? null;
  return data.chapters.find((c) => c.id === scene.chapter_id) ?? null;
}

export function currentBeatFor(
  data: SpineData,
  scene: SpineScene | null,
  chapter: SpineChapter | null,
): SpineBeat | null {
  if (scene && scene.beat_ids?.length) {
    const b = data.beats.find((x) => scene.beat_ids.includes(x.id));
    if (b) return b;
  }
  if (chapter && chapter.beat_ids?.length) {
    const b = data.beats.find((x) => chapter.beat_ids.includes(x.id));
    if (b) return b;
  }
  // first empty beat
  return data.beats.find((b) => b.coverage === "empty") ?? data.beats[0] ?? null;
}
