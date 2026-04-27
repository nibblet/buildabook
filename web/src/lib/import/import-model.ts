import { z } from "zod";
import type { ExtractedDraftT } from "@/lib/ai/extract";
import { countWords } from "@/lib/utils";

export type ExistingImportCharacter = {
  id: string;
  name: string | null;
  aliases?: string[] | null;
};

export type ExistingImportWorldElement = {
  id: string;
  name: string | null;
  aliases?: string[] | null;
};

export type ExistingImportChapter = {
  id: string;
  title: string | null;
  order_index: number | null;
};

export type ExistingImportBeat = {
  id: string;
  beat_type: string | null;
  title: string | null;
};

export type ImportMatch = {
  kind: "exact" | "alias" | "new";
  existingId: string | null;
  existingName: string | null;
};

export const ImportReviewSchema = z.object({
  chapterTitle: z.string(),
  premise: z.string().nullable(),
  styleNotes: z.string().nullable(),
  beatsCovered: z.array(z.string()),
  openThreads: z.array(z.object({ question: z.string() })),
  styleSample: z
    .object({
      label: z.string(),
      content: z.string(),
    })
    .nullable(),
  chapters: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullable(),
      order_index: z.number().nullable(),
    }),
  ),
  characters: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      role: z.string().nullable(),
      species: z.string().nullable(),
      archetype: z.string().nullable(),
      appearance: z.string().nullable(),
      voice_notes: z.string().nullable(),
      powers: z.string().nullable(),
      backstory: z.string().nullable(),
      aliases: z.array(z.string()),
      selected: z.boolean(),
      match: z.object({
        kind: z.enum(["exact", "alias", "new"]),
        existingId: z.string().nullable(),
        existingName: z.string().nullable(),
      }),
    }),
  ),
  worldElements: z.array(
    z.object({
      key: z.string(),
      category: z.string(),
      name: z.string(),
      description: z.string(),
      selected: z.boolean(),
      match: z.object({
        kind: z.enum(["exact", "alias", "new"]),
        existingId: z.string().nullable(),
        existingName: z.string().nullable(),
      }),
    }),
  ),
  scenes: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      order_index: z.number(),
      pov_character_name: z.string().nullable(),
      goal: z.string().nullable(),
      conflict: z.string().nullable(),
      outcome: z.string().nullable(),
      content: z.string(),
      rawContent: z.string(),
      wordcount: z.number(),
      beatIds: z.array(z.string()),
      beatsCovered: z.array(z.string()),
    }),
  ),
});

export type ImportReview = z.infer<typeof ImportReviewSchema>;

export const ImportCommitPayloadSchema = z.object({
  review: ImportReviewSchema,
  placement: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("new_chapter"),
      title: z.string().trim().min(1).optional(),
    }),
    z.object({
      mode: z.literal("existing_chapter"),
      chapterId: z.string().uuid(),
    }),
  ]),
  selectedCharacterKeys: z.array(z.string()),
  selectedWorldElementKeys: z.array(z.string()),
  createOpenThreads: z.boolean().default(false),
  createStyleSample: z.boolean().default(false),
});

export type ImportCommitPayload = z.infer<typeof ImportCommitPayloadSchema>;

export type SceneInsertRow = {
  chapter_id: string;
  order_index: number;
  title: string;
  pov_character_id: string | null;
  goal: string | null;
  conflict: string | null;
  outcome: string | null;
  content: string;
  wordcount: number;
  beat_ids: string[];
  status: "drafting";
};

type ImportReviewContext = {
  characters: ExistingImportCharacter[];
  worldElements: ExistingImportWorldElement[];
  chapters: ExistingImportChapter[];
  beats: ExistingImportBeat[];
};

export function buildImportReview(
  extracted: ExtractedDraftT,
  context: ImportReviewContext,
): ImportReview {
  const beatTypeToId = new Map(
    context.beats
      .filter((beat) => beat.beat_type)
      .map((beat) => [beat.beat_type as string, beat.id]),
  );

  const review: ImportReview = {
    chapterTitle: extracted.chapter_title?.trim() || "Imported Chapter",
    premise: extracted.premise ?? null,
    styleNotes: extracted.style_notes ?? null,
    beatsCovered: extracted.beats_covered ?? [],
    openThreads: extracted.open_threads ?? [],
    styleSample: extracted.style_sample ?? null,
    chapters: context.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      order_index: chapter.order_index,
    })),
    characters: extracted.characters.map((character, idx) => {
      const match = findExistingMatch(
        character.name,
        context.characters,
        character.aliases ?? [],
      );
      return {
        key: `character-${idx}`,
        name: character.name,
        role: character.role ?? null,
        species: character.species ?? null,
        archetype: character.archetype ?? null,
        appearance: character.appearance ?? null,
        voice_notes: character.voice_notes ?? null,
        powers: character.powers ?? null,
        backstory: character.backstory ?? null,
        aliases: character.aliases ?? [],
        selected: match.kind === "new",
        match,
      };
    }),
    worldElements: extracted.world_elements.map((element, idx) => {
      const match = findExistingMatch(element.name, context.worldElements);
      return {
        key: `world-${idx}`,
        category: element.category,
        name: element.name,
        description: element.description,
        selected: match.kind === "new",
        match,
      };
    }),
    scenes: extracted.scenes.map((scene, idx) => {
      const content = textToSceneHtml(scene.content);
      return {
        key: `scene-${idx}`,
        title: `Scene ${idx + 1}`,
        order_index:
          typeof scene.order_index === "number" ? scene.order_index : idx,
        pov_character_name: scene.pov_character_name ?? null,
        goal: scene.goal ?? null,
        conflict: scene.conflict ?? null,
        outcome: scene.outcome ?? null,
        content,
        rawContent: scene.content,
        wordcount: countWords(content),
        beatIds: (scene.beats_covered ?? [])
          .map((beatType) => beatTypeToId.get(beatType))
          .filter((id): id is string => Boolean(id)),
        beatsCovered: scene.beats_covered ?? [],
      };
    }),
  };

  return ImportReviewSchema.parse(review);
}

export function buildSceneInsertRows({
  review,
  chapterId,
  startOrder,
  existingCharacterIdsByImportedName,
  newCharacterIdsByImportedName,
}: {
  review: ImportReview;
  chapterId: string;
  startOrder: number;
  existingCharacterIdsByImportedName: Map<string, string>;
  newCharacterIdsByImportedName: Map<string, string>;
}): SceneInsertRow[] {
  return review.scenes.map((scene, idx) => {
    const povName = scene.pov_character_name;
    const characterIdsByName = buildCharacterIdLookup(
      review,
      existingCharacterIdsByImportedName,
      newCharacterIdsByImportedName,
    );
    const povId = povName ? (characterIdsByName.get(normalizeName(povName)) ?? null) : null;

    return {
      chapter_id: chapterId,
      order_index: startOrder + idx,
      title: scene.title,
      pov_character_id: povId,
      goal: scene.goal,
      conflict: scene.conflict,
      outcome: scene.outcome,
      content: textToSceneHtml(scene.rawContent),
      wordcount: countWords(scene.rawContent),
      beat_ids: scene.beatIds,
      status: "drafting",
    };
  });
}

export function textToSceneHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function findExistingMatch(
  name: string,
  rows: Array<{ id: string; name: string | null; aliases?: string[] | null }>,
  aliases: string[] = [],
): ImportMatch {
  const normalizedCandidates = [name, ...aliases].map(normalizeName);
  const exact = rows.find((row) =>
    normalizedCandidates.includes(normalizeName(row.name ?? "")),
  );
  if (exact) {
    return { kind: "exact", existingId: exact.id, existingName: exact.name };
  }

  const alias = rows.find((row) =>
    (row.aliases ?? []).some((candidate) =>
      normalizedCandidates.includes(normalizeName(candidate)),
    ),
  );
  if (alias) {
    return { kind: "alias", existingId: alias.id, existingName: alias.name };
  }

  return { kind: "new", existingId: null, existingName: null };
}

function buildCharacterIdLookup(
  review: ImportReview,
  existingCharacterIdsByImportedName: Map<string, string>,
  newCharacterIdsByImportedName: Map<string, string>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [name, id] of existingCharacterIdsByImportedName) {
    lookup.set(normalizeName(name), id);
  }
  for (const [name, id] of newCharacterIdsByImportedName) {
    lookup.set(normalizeName(name), id);
  }
  for (const character of review.characters) {
    const id =
      existingCharacterIdsByImportedName.get(character.name) ??
      newCharacterIdsByImportedName.get(character.name);
    if (!id) continue;
    lookup.set(normalizeName(character.name), id);
    for (const alias of character.aliases) {
      lookup.set(normalizeName(alias), id);
    }
  }
  return lookup;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
