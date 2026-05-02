import type { Beat, Character, Scene } from "@/lib/supabase/types";
import type { SpineChapter, SpineData } from "@/lib/spine";

/** Target max chars per model batch for full-spine review (prompt + outline text). */
export const FLOW_SPINE_BATCH_CHAR_TARGET = 42_000;

export type CharacterNameLookup = Map<string, string>;

export function buildCharacterLookup(
  characters: Pick<Character, "id" | "name">[],
): CharacterNameLookup {
  return new Map(characters.map((c) => [c.id, c.name]));
}

function beatTitlesForScene(scene: Scene, beatsAsc: Beat[]): string {
  const ids = [...(scene.beat_ids ?? [])].sort();
  if (ids.length === 0) return "(none)";
  return ids
    .map((id) => {
      const b = beatsAsc.find((x) => x.id === id);
      return b?.title?.trim() || id.slice(0, 8);
    })
    .join("; ");
}

function povLabel(scene: Scene, lookup: CharacterNameLookup): string {
  if (!scene.pov_character_id) return "(unspecified)";
  return lookup.get(scene.pov_character_id)?.trim() || "(unknown character)";
}

export type SerializedSceneBlock = {
  scene_id: string;
  lines: string[];
};

export function serializeSceneBlock(
  scene: Scene,
  beatsAsc: Beat[],
  lookup: CharacterNameLookup,
): SerializedSceneBlock {
  const label =
    scene.title?.trim() ||
    `Scene ${(scene.order_index ?? 0) + 1}`;
  const goal = (scene.goal ?? "").trim() || "(empty)";
  const conflict = (scene.conflict ?? "").trim() || "(empty)";
  const outcome = (scene.outcome ?? "").trim() || "(empty)";
  const beatsStr = beatTitlesForScene(scene, beatsAsc);
  const lines = [
    `scene_id=${scene.id}`,
    `label=${JSON.stringify(label)}`,
    `pov=${JSON.stringify(povLabel(scene, lookup))}`,
    `beats=${JSON.stringify(beatsStr)}`,
    `goal=${JSON.stringify(goal)}`,
    `conflict=${JSON.stringify(conflict)}`,
    `outcome=${JSON.stringify(outcome)}`,
    `words=${scene.wordcount ?? 0}`,
    `status=${scene.status}`,
  ];
  return { scene_id: scene.id, lines };
}

function serializeChapterSection(
  chapter: SpineChapter,
  beatsAsc: Beat[],
  lookup: CharacterNameLookup,
  scenesOverride?: Scene[],
): string {
  const chTitle =
    chapter.title?.trim() || `Chapter ${(chapter.order_index ?? 0) + 1}`;
  const lines: string[] = [];
  lines.push(`chapter_id=${chapter.id}`);
  lines.push(`chapter_title=${JSON.stringify(chTitle)}`);
  const syn = (chapter.synopsis ?? "").trim();
  if (syn) {
    lines.push(`chapter_synopsis=${JSON.stringify(syn.slice(0, 800))}`);
  }
  lines.push("scenes:");
  const toEmit = scenesOverride ?? chapter.scenes;
  if (toEmit.length === 0) {
    lines.push("  (no scenes)");
  } else {
    for (const s of toEmit) {
      const block = serializeSceneBlock(s, beatsAsc, lookup);
      for (const ln of block.lines) {
        lines.push(`  ${ln}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

/** Deterministic full-book outline text for hashing and model input. */
export function serializeFullSpineOutline(
  spine: SpineData,
  lookup: CharacterNameLookup,
): string {
  const beatsAsc = [...spine.beats].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );
  const parts: string[] = [];
  for (const ch of spine.chapters) {
    parts.push(serializeChapterSection(ch, beatsAsc, lookup));
    parts.push("---");
  }
  return parts.join("\n");
}

/** Serialize a subset of chapters (same format as full spine) for batched AI calls. */
export function serializeSpineChapterSubset(
  spine: SpineData,
  lookup: CharacterNameLookup,
  chapters: SpineChapter[],
): string {
  const beatsAsc = [...spine.beats].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );
  const parts: string[] = [];
  for (const ch of chapters) {
    parts.push(serializeChapterSection(ch, beatsAsc, lookup));
    parts.push("---");
  }
  return parts.join("\n");
}

export type FlowWindowMode = "chapter" | "chapter_with_neighbors";

export const DEFAULT_NEIGHBOR_SCENE_COUNT = 3;

/** Split ordered chapters into batches whose serialized length stays under maxChars (best-effort). */
export function chunkChaptersForSpineFlow(
  spine: SpineData,
  lookup: CharacterNameLookup,
  maxChars: number,
): SpineChapter[][] {
  if (spine.chapters.length === 0) return [];
  const batches: SpineChapter[][] = [];
  let current: SpineChapter[] = [];
  let currentLen = 0;

  for (const ch of spine.chapters) {
    const piece = serializeSpineChapterSubset(spine, lookup, [ch]);
    const sep = current.length > 0 ? 2 : 0;
    if (current.length > 0 && currentLen + sep + piece.length > maxChars) {
      batches.push(current);
      current = [ch];
      currentLen = piece.length;
    } else {
      current.push(ch);
      currentLen += sep + piece.length;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export type ChapterFlowWindowParts = {
  prevTail: { chapter: SpineChapter; scenes: Scene[] } | null;
  current: SpineChapter;
  nextHead: { chapter: SpineChapter; scenes: Scene[] } | null;
};

export function getChapterFlowWindowParts(
  spine: SpineData,
  chapterId: string,
  mode: FlowWindowMode,
  neighborSceneCount: number,
): ChapterFlowWindowParts | null {
  const idx = spine.chapters.findIndex((c) => c.id === chapterId);
  if (idx === -1) return null;
  const n = Math.max(0, Math.min(10, neighborSceneCount));
  const current = spine.chapters[idx]!;
  let prevTail: ChapterFlowWindowParts["prevTail"] = null;
  let nextHead: ChapterFlowWindowParts["nextHead"] = null;
  if (mode === "chapter_with_neighbors") {
    if (idx > 0) {
      const prev = spine.chapters[idx - 1]!;
      const scenes = prev.scenes.slice(-n);
      if (scenes.length > 0) prevTail = { chapter: prev, scenes };
    }
    if (idx < spine.chapters.length - 1) {
      const next = spine.chapters[idx + 1]!;
      const scenes = next.scenes.slice(0, n);
      if (scenes.length > 0) nextHead = { chapter: next, scenes };
    }
  }
  return { prevTail, current, nextHead };
}

/**
 * Metadata-only sliding window: current chapter scenes, optionally prev/next tails for handoffs.
 */
export function serializeChapterFlowWindow(
  spine: SpineData,
  lookup: CharacterNameLookup,
  chapterId: string,
  mode: FlowWindowMode,
  neighborSceneCount: number = DEFAULT_NEIGHBOR_SCENE_COUNT,
): string {
  const parts = getChapterFlowWindowParts(spine, chapterId, mode, neighborSceneCount);
  if (!parts) return "";

  const beatsAsc = [...spine.beats].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );

  const out: string[] = [];
  out.push(`focus_chapter_id=${chapterId}`);
  out.push(`window_mode=${mode}`);
  if (mode === "chapter_with_neighbors") {
    out.push(`neighbor_scene_count=${neighborSceneCount}`);
  }
  out.push("");

  if (parts.prevTail) {
    out.push("### PREVIOUS_CHAPTER (tail scenes — continuity into focus chapter)");
    out.push(
      serializeChapterSection(
        parts.prevTail.chapter,
        beatsAsc,
        lookup,
        parts.prevTail.scenes,
      ),
    );
    out.push("---");
  }

  out.push("### FOCUS_CHAPTER (full)");
  out.push(serializeChapterSection(parts.current, beatsAsc, lookup));
  out.push("---");

  if (parts.nextHead) {
    out.push("### NEXT_CHAPTER (head scenes — continuity out of focus chapter)");
    out.push(
      serializeChapterSection(
        parts.nextHead.chapter,
        beatsAsc,
        lookup,
        parts.nextHead.scenes,
      ),
    );
  }

  return out.join("\n");
}
