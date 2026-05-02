import { describe, expect, it } from "vitest";
import type { Scene } from "@/lib/supabase/types";
import type { SpineBeat, SpineChapter, SpineData } from "@/lib/spine";
import {
  buildCharacterLookup,
  chunkChaptersForSpineFlow,
  getChapterFlowWindowParts,
  serializeChapterFlowWindow,
  serializeFullSpineOutline,
} from "@/lib/ai/flow-outline-serialize";

function ch(
  id: string,
  order: number,
  scenes: Scene[],
  title: string,
): SpineChapter {
  return {
    id,
    project_id: "p1",
    order_index: order,
    title,
    pov_character_id: null,
    synopsis: order === 0 ? "First chapter arc." : null,
    beat_ids: [],
    wordcount: 0,
    status: "drafting",
    updated_at: "2020-01-01",
    scenes,
  } as SpineChapter;
}

function sc(
  id: string,
  chapterId: string,
  order: number,
  goal: string,
): Scene {
  return {
    id,
    chapter_id: chapterId,
    order_index: order,
    title: `Scene ${order}`,
    pov_character_id: "char-1",
    beat_ids: ["beat-1"],
    goal,
    conflict: "c",
    outcome: "o",
    content: null,
    wordcount: 10,
    status: "drafting",
    updated_at: "2020-01-01",
  };
}

const beat1: SpineBeat = {
  id: "beat-1",
  project_id: "p1",
  order_index: 0,
  act: 1,
  beat_type: null,
  title: "Opening",
  description: null,
  why_it_matters: null,
  target_chapter: null,
  created_at: "2020-01-01",
  coverage: "partial",
};

function makeSpine(): SpineData {
  const c1 = ch("ch-1", 0, [sc("s-1", "ch-1", 0, "g1")], "Alpha");
  const c2 = ch("ch-2", 1, [sc("s-2", "ch-2", 0, "g2")], "Beta");
  return {
    beats: [beat1],
    chaptersByBeat: {},
    chapters: [c1, c2],
    scenes: [...c1.scenes, ...c2.scenes],
    totalWordcount: 20,
  };
}

describe("flow-outline-serialize", () => {
  it("produces stable full-spine text for the same data", () => {
    const spine = makeSpine();
    const lookup = buildCharacterLookup([{ id: "char-1", name: "Avery" }]);
    const a = serializeFullSpineOutline(spine, lookup);
    const b = serializeFullSpineOutline(spine, lookup);
    expect(a).toBe(b);
    expect(a).toContain("chapter_id=ch-1");
    expect(a).toContain("scene_id=s-1");
    expect(a).toContain("Avery");
  });

  it("chunks chapters when maxChars is small", () => {
    const spine = makeSpine();
    const lookup = buildCharacterLookup([]);
    const batches = chunkChaptersForSpineFlow(spine, lookup, 400);
    expect(batches.length).toBeGreaterThanOrEqual(2);
    expect(batches.flat().map((c) => c.id)).toEqual(["ch-1", "ch-2"]);
  });

  it("getChapterFlowWindowParts: first chapter has no prev tail", () => {
    const spine = makeSpine();
    const parts = getChapterFlowWindowParts(spine, "ch-1", "chapter_with_neighbors", 1);
    expect(parts?.prevTail).toBeNull();
    expect(parts?.current.id).toBe("ch-1");
    expect(parts?.nextHead?.chapter.id).toBe("ch-2");
    expect(parts?.nextHead?.scenes.map((s) => s.id)).toEqual(["s-2"]);
  });

  it("getChapterFlowWindowParts: last chapter has no next head", () => {
    const spine = makeSpine();
    const parts = getChapterFlowWindowParts(spine, "ch-2", "chapter_with_neighbors", 1);
    expect(parts?.prevTail?.scenes.map((s) => s.id)).toEqual(["s-1"]);
    expect(parts?.nextHead).toBeNull();
  });

  it("chapter mode omits neighbor sections in window text", () => {
    const spine = makeSpine();
    const lookup = buildCharacterLookup([{ id: "char-1", name: "Avery" }]);
    const text = serializeChapterFlowWindow(
      spine,
      lookup,
      "ch-1",
      "chapter",
      3,
    );
    expect(text).toContain("FOCUS_CHAPTER");
    expect(text).not.toContain("PREVIOUS_CHAPTER");
    expect(text).not.toContain("NEXT_CHAPTER");
  });

  it("neighbors mode includes tail and head sections when scenes exist", () => {
    const spine = makeSpine();
    const lookup = buildCharacterLookup([{ id: "char-1", name: "Avery" }]);
    const text = serializeChapterFlowWindow(
      spine,
      lookup,
      "ch-1",
      "chapter_with_neighbors",
      1,
    );
    expect(text).toContain("NEXT_CHAPTER");
    expect(text).toContain("scene_id=s-2");
  });
});
