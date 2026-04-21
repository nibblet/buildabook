import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import {
  type WritingProfileId,
  parseWritingProfile,
} from "@/lib/deployment/writing-profile";
import { askModel, resolveModelFromProject } from "@/lib/ai/model";

// Proposal shape returned from scratchpad notes. Keys are stable strings the
// client uses to select items into a Promote commit — the server does not
// persist them; they're just round-trip identifiers.

const ProposedBeat = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string().optional().nullable(),
  why_it_matters: z.string().optional().nullable(),
  act: z.number().int().min(1).max(3).optional().nullable(),
});

const ProposedCharacter = z.object({
  key: z.string(),
  name: z.string(),
  role: z.string().optional().nullable(),
  archetype: z.string().optional().nullable(),
  wound: z.string().optional().nullable(),
  desire: z.string().optional().nullable(),
  need: z.string().optional().nullable(),
  voice_notes: z.string().optional().nullable(),
});

const ProposedChapter = z.object({
  key: z.string(),
  title: z.string(),
  synopsis: z.string().optional().nullable(),
  pov_character_name: z.string().optional().nullable(),
  beat_keys: z.array(z.string()).optional().default([]),
});

const ProposedScene = z.object({
  key: z.string(),
  chapter_key: z.string().optional().nullable(),
  chapter_title: z.string().optional().nullable(),
  title: z.string(),
  goal: z.string().optional().nullable(),
  conflict: z.string().optional().nullable(),
  outcome: z.string().optional().nullable(),
});

export const ProposalSchema = z.object({
  beats: z.array(ProposedBeat).default([]),
  characters: z.array(ProposedCharacter).default([]),
  chapters: z.array(ProposedChapter).default([]),
  scenes: z.array(ProposedScene).default([]),
  open_questions: z.array(z.string()).default([]),
});

export type Proposal = z.infer<typeof ProposalSchema>;
export type ProposedBeatT = z.infer<typeof ProposedBeat>;
export type ProposedCharacterT = z.infer<typeof ProposedCharacter>;
export type ProposedChapterT = z.infer<typeof ProposedChapter>;
export type ProposedSceneT = z.infer<typeof ProposedScene>;

export type ExistingContext = {
  existingBeatTitles: string[];
  existingChapterTitles: string[];
  existingCharacterNames: string[];
};

function stripCodeFence(text: string): string {
  let s = text.trim();
  const m = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/im.exec(s);
  if (m) return m[1].trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*\r?\n?/i, "").replace(/\r?\n```\s*$/i, "");
  }
  return s.trim();
}

function extractJson(text: string): unknown {
  const stripped = stripCodeFence(text);
  const start = stripped.indexOf("{");
  if (start === -1) throw new Error("Extractor returned no JSON object");
  const candidate = stripped.slice(start);
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch {
      const endIdx = candidate.lastIndexOf("}");
      if (endIdx >= 1) {
        try {
          return JSON.parse(jsonrepair(candidate.slice(0, endIdx + 1)));
        } catch {
          /* fall through */
        }
      }
      throw new Error("Could not parse proposal JSON.");
    }
  }
}

function systemPrompt(): string {
  return `You are a story-structure assistant. Read an author's freeform planning notes and propose concrete additions to their book's outline.

Be faithful to the notes. Do NOT invent plot points, characters, or locations the notes do not imply. If the notes are sparse, propose less rather than padding.

Prefer proposing additions to what already exists rather than duplicates. Reuse existing titles when the notes clearly reference them; only propose NEW items.

Return ONLY valid JSON — one top-level object, double-quoted keys, no trailing commas, no markdown fences, no commentary before or after.`;
}

function userPrompt(notes: string, ctx: ExistingContext): string {
  return `Existing outline (do not propose duplicates):
- Beats: ${ctx.existingBeatTitles.length ? ctx.existingBeatTitles.join(", ") : "(none)"}
- Chapters: ${ctx.existingChapterTitles.length ? ctx.existingChapterTitles.join(", ") : "(none)"}
- Characters: ${ctx.existingCharacterNames.length ? ctx.existingCharacterNames.join(", ") : "(none)"}

Return a JSON object with this shape. Use stable short strings for every "key" field (e.g. "b1", "ch1", "sc1", "ch1-sc2"). Scene.chapter_key must reference a chapters[].key when the scene belongs to a proposed NEW chapter; otherwise set chapter_title to an existing chapter title.

{
  "beats": [
    { "key": "b1", "title": "Midpoint Reversal", "description": "...", "why_it_matters": "...", "act": 2 }
  ],
  "characters": [
    { "key": "c1", "name": "Mara", "role": "protagonist", "archetype": "...", "wound": "...", "desire": "...", "need": "...", "voice_notes": "..." }
  ],
  "chapters": [
    { "key": "ch1", "title": "The Offer", "synopsis": "...", "pov_character_name": "Mara", "beat_keys": ["b1"] }
  ],
  "scenes": [
    { "key": "sc1", "chapter_key": "ch1", "chapter_title": null, "title": "Mara reads the letter", "goal": "...", "conflict": "...", "outcome": "..." }
  ],
  "open_questions": [
    "Short question the notes raised but did not answer."
  ]
}

RULES:
- Include only fields you can justify from the notes.
- Empty arrays are fine — prefer precision over volume.
- At most 10 items per category. If the notes suggest more, pick the clearest.
- Titles should be short (under 60 chars).
- "title" fields for scenes may be a one-line beat summary, not formal prose titles.

NOTES:
${notes}`;
}

export async function proposeFromNotes(
  notes: string,
  existing: ExistingContext,
  opts?: {
    projectId?: string | null;
    writingProfile?: WritingProfileId | string | null;
  },
): Promise<Proposal> {
  if (!notes.trim()) {
    return {
      beats: [],
      characters: [],
      chapters: [],
      scenes: [],
      open_questions: [],
    };
  }
  const wp = parseWritingProfile(opts?.writingProfile ?? undefined);
  const model = resolveModelFromProject(wp, "quick");
  const { text } = await askModel({
    persona: "extract",
    system: systemPrompt(),
    user: userPrompt(notes, existing),
    model,
    temperature: 0.3,
    maxTokens: 4096,
    projectId: opts?.projectId ?? null,
    contextType: "scratchpad",
    writingProfile: wp,
  });
  const parsed = extractJson(text);
  return ProposalSchema.parse(parsed);
}
