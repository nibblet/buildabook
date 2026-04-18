import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { askClaude, resolveModelKey } from "@/lib/ai/claude";

// Schema for one-shot draft extraction (import-first onboarding, v2 §12).
export const ExtractedCharacter = z.object({
  name: z.string(),
  role: z.string().optional().nullable(),
  species: z.string().optional().nullable(),
  archetype: z.string().optional().nullable(),
  appearance: z.string().optional().nullable(),
  voice_notes: z.string().optional().nullable(),
  powers: z.string().optional().nullable(),
  backstory: z.string().optional().nullable(),
  aliases: z.array(z.string()).optional().default([]),
  confidence: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

export const ExtractedWorldElement = z.object({
  category: z.enum([
    "species",
    "magic_rule",
    "creature",
    "faction",
    "location",
    "item",
    "lore",
  ]),
  name: z.string(),
  description: z.string(),
  quoted_evidence: z.string().optional().nullable(),
  confidence: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

// Scene prose is NOT embedded in JSON from the model — only paragraph indices.
// We assemble verbatim text server-side so quotes/newlines can't break JSON.parse.
export const ExtractedSceneCore = z.object({
  order_index: z.number(),
  paragraph_start: z.number().int().min(0),
  paragraph_end: z.number().int().min(0),
  pov_character_name: z.string().optional().nullable(),
  goal: z.string().optional().nullable(),
  conflict: z.string().optional().nullable(),
  outcome: z.string().optional().nullable(),
  beats_covered: z.array(z.string()).optional().default([]),
});

export const ExtractedScene = ExtractedSceneCore.extend({
  content: z.string(),
});

export const ExtractedThread = z.object({
  question: z.string(),
});

export const ExtractedDraftRaw = z.object({
  premise: z.string().optional().nullable(),
  style_notes: z.string().optional().nullable(),
  paranormal_type: z.string().optional().nullable(),
  pov_style: z.string().optional().nullable(),
  chapter_title: z.string().optional().nullable(),
  characters: z.array(ExtractedCharacter).default([]),
  world_elements: z.array(ExtractedWorldElement).default([]),
  scenes: z.array(ExtractedSceneCore).default([]),
  beats_covered: z.array(z.string()).default([]),
  open_threads: z.array(ExtractedThread).default([]),
  style_sample: z
    .object({ label: z.string(), content: z.string() })
    .optional()
    .nullable(),
});

export type ExtractedDraftT = Omit<
  z.infer<typeof ExtractedDraftRaw>,
  "scenes"
> & {
  scenes: z.infer<typeof ExtractedScene>[];
};

const EXTRACT_SYSTEM = `You are an expert paranormal-romance developmental editor. Your job is to read a chapter or draft the author has written and extract the structural facts needed to set up a writing studio for her book.

Be thorough but grounded. Only include items that the text supports. Every world element must have evidence in the prose; every character must actually appear or be clearly referenced. Do not invent tropes the text does not hint at.

You must return ONLY valid JSON: one top-level object, double-quoted keys, no trailing commas, no markdown fences, no commentary before or after. Do NOT put large blocks of story prose inside any string — the user message lists numbered paragraphs; reference them by index only (see schema).`;

const BEAT_TYPES = [
  "ordinary_world",
  "meet_cute",
  "paranormal_reveal",
  "pull_push",
  "first_bond",
  "midpoint",
  "false_happy",
  "black_moment",
  "grand_gesture",
  "climax",
  "hea",
];

/** Split draft on blank lines — keeps dialogue line breaks inside a paragraph together. */
export function splitDraftIntoParagraphs(draftText: string): string[] {
  const normalized = draftText.replace(/\r\n/g, "\n");
  const parts = normalized.split(/\n\s*\n+/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function buildNumberedDraftBody(paragraphs: string[]): string {
  return paragraphs
    .map(
      (p, i) => `<<<PARAGRAPH_INDEX_${i}>>>\n${p}`,
    )
    .join("\n\n");
}

function extractUserPromptFromParagraphs(paragraphs: string[]): string {
  const body = buildNumberedDraftBody(paragraphs);
  return `There are ${paragraphs.length} paragraphs, indexed 0 through ${paragraphs.length - 1}.

Read them and return a single JSON object with this shape:

{
  "premise": "1-3 sentences pitch inferred from the draft.",
  "style_notes": "Short voice description — rhythm, POV, habits.",
  "paranormal_type": "primary paranormal type if any",
  "pov_style": "e.g. third-person deep, past tense",
  "chapter_title": "suggested chapter title",
  "characters": [
    {
      "name": "string",
      "role": "protagonist | love_interest | antagonist | supporting | animal_companion | backstory",
      "species": "human | shifter | vampire | witch | fae | psychic | unknown | ...",
      "archetype": "optional short phrase",
      "appearance": "optional one-line",
      "voice_notes": "optional",
      "powers": "optional",
      "backstory": "optional",
      "aliases": ["aliases"],
      "confidence": "low | medium | high"
    }
  ],
  "world_elements": [
    {
      "category": "species | magic_rule | creature | faction | location | item | lore",
      "name": "short name",
      "description": "one-line summary grounded in the text",
      "quoted_evidence": "optional short phrase from the draft",
      "confidence": "low | medium | high"
    }
  ],
  "scenes": [
    {
      "order_index": 0,
      "paragraph_start": 0,
      "paragraph_end": 4,
      "pov_character_name": "name",
      "goal": "what the POV wants in this scene",
      "conflict": "obstacle",
      "outcome": "win | lose | win-but",
      "beats_covered": ["ordinary_world", "meet_cute"]
    }
  ],
  "beats_covered": ["ordinary_world", "meet_cute"],
  "open_threads": [
    { "question": "unanswered question raised in the draft" }
  ],
  "style_sample": {
    "label": "opening | action | dialogue | introspection | intimate",
    "content": "a ~150–300 word excerpt representing the voice (may use straight double quotes sparingly; avoid unescaped line breaks inside the string)"
  }
}

Allowed beat_type values for beats_covered arrays: ${BEAT_TYPES.join(", ")}.

SCENE RULES — important:
- For each scene, set "paragraph_start" and "paragraph_end" to **inclusive** indices (0-based) referring to <<<PARAGRAPH_INDEX_N>>> markers in the draft below.
- Cover every paragraph index in exactly one scene, in order. No gaps and no overlaps.
- **Prefer fewer, larger scenes.** Target roughly **3–10 scenes** for a typical chapter-length paste (roughly 2k–6k words). Do **not** create a new scene for every paragraph, every short beat of action, or every line of dialogue.
- Only split when there is a **real scene break**: a line containing only "---", a major shift in time/location, a clear POV handoff, or a new intention (new goal for the POV). Otherwise **merge** consecutive paragraphs into the same scene.
- If the pasted material is **short** (under ~1500 words), prefer **1–3 scenes** total, or even **one scene** for the whole paste.
- If the pasted material is **very long** (multi-chapter paste), still avoid dozens of scenes: use **coarse** splits (major sections only), not fine-grained slicing.
- **beats_covered** on a scene lists story beats that pass through that scene — one scene may touch multiple beats; do **not** split solely to isolate each beat into its own scene.
- If the whole paste reads as one continuous flow, use paragraph_start 0 and paragraph_end ${paragraphs.length - 1} for a single scene (still list beats_covered appropriately).
- Short strings only in JSON — never paste the full chapter into any field except optionally style_sample.content (keep under ~800 characters there if needed).

DRAFT (numbered paragraphs):

${body}`;
}

function assembleSceneContents(
  paragraphs: string[],
  scenes: z.infer<typeof ExtractedSceneCore>[],
): z.infer<typeof ExtractedScene>[] {
  const maxIdx = paragraphs.length - 1;
  const sorted = [...scenes].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );

  return sorted.map((sc) => {
    let start = Math.min(sc.paragraph_start, sc.paragraph_end);
    let end = Math.max(sc.paragraph_start, sc.paragraph_end);
    start = Math.max(0, Math.min(start, maxIdx));
    end = Math.max(0, Math.min(end, maxIdx));
    if (start > end) [start, end] = [end, start];

    const content = paragraphs.slice(start, end + 1).join("\n\n");

    return {
      ...sc,
      paragraph_start: start,
      paragraph_end: end,
      content,
    };
  });
}

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
  if (start === -1) {
    throw new Error("Extractor returned no JSON object");
  }

  const candidate = stripped.slice(start);

  const tryParse = (raw: string) => JSON.parse(raw);

  try {
    return tryParse(candidate);
  } catch {
    try {
      return tryParse(jsonrepair(candidate));
    } catch {
      const endIdx = candidate.lastIndexOf("}");
      if (endIdx >= 1) {
        const slice = candidate.slice(0, endIdx + 1);
        try {
          return tryParse(jsonrepair(slice));
        } catch {
          /* fall through */
        }
      }
      throw new Error(
        "Could not parse extraction JSON. Try again, or shorten the pasted chapter.",
      );
    }
  }
}

export async function extractDraft(
  draftText: string,
  opts?: { projectId?: string | null },
): Promise<ExtractedDraftT> {
  if (!draftText.trim()) {
    throw new Error("Draft text is empty.");
  }

  const paragraphs = splitDraftIntoParagraphs(draftText);
  if (paragraphs.length === 0) {
    throw new Error("Draft has no paragraphs after splitting.");
  }

  const model = resolveModelKey("prose");
  const { text } = await askClaude({
    persona: "extract",
    system: EXTRACT_SYSTEM,
    user: extractUserPromptFromParagraphs(paragraphs),
    model,
    temperature: 0.2,
    // Metadata-only JSON is small; large input is the chapter text itself.
    maxTokens: 8192,
    projectId: opts?.projectId ?? null,
    contextType: "onboarding",
  });

  const parsedRaw = extractJson(text);
  const raw = ExtractedDraftRaw.parse(parsedRaw);

  let scenesWithContent = assembleSceneContents(paragraphs, raw.scenes);

  // If the model omitted scenes entirely, preserve the whole draft as one scene.
  if (scenesWithContent.length === 0) {
    scenesWithContent = [
      {
        order_index: 0,
        paragraph_start: 0,
        paragraph_end: Math.max(0, paragraphs.length - 1),
        pov_character_name: null,
        goal: null,
        conflict: null,
        outcome: null,
        beats_covered: raw.beats_covered ?? [],
        content: paragraphs.join("\n\n"),
      },
    ];
  }

  return {
    ...raw,
    scenes: scenesWithContent,
  };
}
