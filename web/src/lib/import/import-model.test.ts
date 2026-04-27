import { describe, expect, it } from "vitest";
import {
  buildImportReview,
  buildSceneInsertRows,
  textToSceneHtml,
} from "./import-model";
import type { ExtractedDraftT } from "@/lib/ai/extract";

const extracted: ExtractedDraftT = {
  premise: "A courier reaches the haunted harbor.",
  style_notes: "Close third with clipped tension.",
  paranormal_type: null,
  pov_style: "third-person past",
  chapter_title: "Harbor of Teeth",
  characters: [
    {
      name: "Mara Vale",
      role: "lead",
      species: null,
      archetype: null,
      appearance: null,
      voice_notes: null,
      powers: null,
      backstory: null,
      aliases: ["Mara"],
      confidence: "high",
    },
    {
      name: "Idris",
      role: "ally",
      species: null,
      archetype: null,
      appearance: null,
      voice_notes: null,
      powers: null,
      backstory: null,
      aliases: [],
      confidence: "medium",
    },
  ],
  world_elements: [
    {
      category: "location",
      name: "Black Harbor",
      description: "A fogbound port where ghosts gather.",
      quoted_evidence: "the black harbor swallowed the bells",
      confidence: "high",
    },
    {
      category: "item",
      name: "Moon Key",
      description: "A silver key that opens sealed doors.",
      quoted_evidence: null,
      confidence: "medium",
    },
  ],
  scenes: [
    {
      order_index: 0,
      paragraph_start: 0,
      paragraph_end: 1,
      pov_character_name: "Mara Vale",
      goal: "Reach the harbor master.",
      conflict: "The ghosts block the pier.",
      outcome: "win-but",
      beats_covered: ["ordinary_world"],
      content: "Mara reached the pier.\n\nThe bells were already ringing.",
    },
    {
      order_index: 1,
      paragraph_start: 2,
      paragraph_end: 2,
      pov_character_name: "Idris",
      goal: "Warn Mara.",
      conflict: null,
      outcome: "lose",
      beats_covered: [],
      content: "Idris saw the Moon Key flash.",
    },
  ],
  beats_covered: ["ordinary_world"],
  open_threads: [{ question: "Who rang the bells?" }],
  style_sample: null,
};

describe("buildImportReview", () => {
  it("suggests exact and alias matches without marking new entities selected", () => {
    const review = buildImportReview(extracted, {
      characters: [
        { id: "c1", name: "Mara Vale", aliases: [] },
        { id: "c2", name: "Captain Sol", aliases: ["Idris"] },
      ],
      worldElements: [{ id: "w1", name: "The Harbor", aliases: ["Black Harbor"] }],
      chapters: [{ id: "ch1", title: "Chapter 1", order_index: 0 }],
      beats: [{ id: "b1", beat_type: "ordinary_world", title: "Ordinary World" }],
    });

    expect(review.characters).toMatchObject([
      {
        name: "Mara Vale",
        selected: false,
        match: { kind: "exact", existingId: "c1", existingName: "Mara Vale" },
      },
      {
        name: "Idris",
        selected: false,
        match: { kind: "alias", existingId: "c2", existingName: "Captain Sol" },
      },
    ]);
    expect(review.worldElements).toMatchObject([
      {
        name: "Black Harbor",
        selected: false,
        match: { kind: "alias", existingId: "w1", existingName: "The Harbor" },
      },
      {
        name: "Moon Key",
        selected: true,
        match: { kind: "new", existingId: null },
      },
    ]);
    expect(review.scenes[0]).toMatchObject({
      title: "Scene 1",
      content: "<p>Mara reached the pier.</p><p>The bells were already ringing.</p>",
      beatIds: ["b1"],
    });
  });
});

describe("buildSceneInsertRows", () => {
  it("maps POV names through selected existing and newly inserted characters", () => {
    const review = buildImportReview(extracted, {
      characters: [{ id: "c1", name: "Mara Vale", aliases: [] }],
      worldElements: [],
      chapters: [],
      beats: [{ id: "b1", beat_type: "ordinary_world", title: "Ordinary World" }],
    });

    const rows = buildSceneInsertRows({
      review,
      chapterId: "chapter-2",
      startOrder: 4,
      existingCharacterIdsByImportedName: new Map([["Mara Vale", "c1"]]),
      newCharacterIdsByImportedName: new Map([["Idris", "c9"]]),
    });

    expect(rows).toEqual([
      {
        chapter_id: "chapter-2",
        order_index: 4,
        title: "Scene 1",
        pov_character_id: "c1",
        goal: "Reach the harbor master.",
        conflict: "The ghosts block the pier.",
        outcome: "win-but",
        content: "<p>Mara reached the pier.</p><p>The bells were already ringing.</p>",
        wordcount: 9,
        beat_ids: ["b1"],
        status: "drafting",
      },
      {
        chapter_id: "chapter-2",
        order_index: 5,
        title: "Scene 2",
        pov_character_id: "c9",
        goal: "Warn Mara.",
        conflict: null,
        outcome: "lose",
        content: "<p>Idris saw the Moon Key flash.</p>",
        wordcount: 6,
        beat_ids: [],
        status: "drafting",
      },
    ]);
  });

  it("resolves POV aliases and case variants through existing matches", () => {
    const aliasDraft: ExtractedDraftT = {
      ...extracted,
      characters: [
        {
          ...extracted.characters[0]!,
          name: "Mara",
          aliases: [],
        },
      ],
      scenes: [
        {
          ...extracted.scenes[0]!,
          pov_character_name: "mara",
        },
      ],
    };
    const review = buildImportReview(aliasDraft, {
      characters: [{ id: "c1", name: "Mara Vale", aliases: ["Mara"] }],
      worldElements: [],
      chapters: [],
      beats: [],
    });

    const rows = buildSceneInsertRows({
      review,
      chapterId: "chapter-1",
      startOrder: 0,
      existingCharacterIdsByImportedName: new Map([["Mara", "c1"]]),
      newCharacterIdsByImportedName: new Map(),
    });

    expect(rows[0]?.pov_character_id).toBe("c1");
  });

  it("rebuilds scene HTML from raw text instead of trusting review HTML", () => {
    const review = buildImportReview(extracted, {
      characters: [],
      worldElements: [],
      chapters: [],
      beats: [],
    });
    review.scenes[0]!.content = '<script>alert("x")</script>';

    const rows = buildSceneInsertRows({
      review,
      chapterId: "chapter-1",
      startOrder: 0,
      existingCharacterIdsByImportedName: new Map(),
      newCharacterIdsByImportedName: new Map(),
    });

    expect(rows[0]?.content).toBe(
      "<p>Mara reached the pier.</p><p>The bells were already ringing.</p>",
    );
  });
});

describe("textToSceneHtml", () => {
  it("escapes HTML and preserves paragraph boundaries", () => {
    expect(textToSceneHtml("A <storm> rose.\n\n\"Run,\" Mara said.")).toBe(
      "<p>A &lt;storm&gt; rose.</p><p>&quot;Run,&quot; Mara said.</p>",
    );
  });
});
