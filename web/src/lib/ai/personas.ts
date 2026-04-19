import type { PersonaKey } from "@/lib/supabase/types";
import {
  type WritingProfileId,
  parseWritingProfile,
  writingProfilePrompts,
} from "@/lib/deployment/writing-profile";

export type CorePersonaKey = Exclude<PersonaKey, "extract" | "factcheck">;

export type PersonaConfig = {
  key: PersonaKey;
  label: string;
  tagline: string;
  directive: string;
  temperature: number;
  model: "prose" | "quick";
  maxTokens: number;
};

export function getPersonas(
  writingProfile: WritingProfileId,
): Record<CorePersonaKey, PersonaConfig> {
  const pr = writingProfilePrompts(writingProfile);

  return {
    partner: {
      key: "partner",
      label: "The Partner",
      tagline: "Writes prose in your voice.",
      directive: `Write the next 200–350 words of prose, matching the voice described above. Stay inside the POV character's head. Show behavior — don't narrate feelings. End on a beat that invites the author's next choice. Do not summarize. Do not narrate what's happening from the outside — be in the scene. Do not add headings, labels, notes, or commentary. Return only the prose.`,
      temperature: 0.8,
      model: "prose",
      maxTokens: 900,
    },
    profiler: {
      key: "profiler",
      label: "The Profiler",
      tagline: "Developmental coach — character, motivation, structure.",
      directive: `You are a gentle but sharp developmental coach for a novice writer. Do not write prose. Do not rewrite. Begin with one specific thing that is working in the author's scene or passage and name why it works. Then ask 3–5 targeted questions or give bulleted feedback that will sharpen what the author just wrote. Focus on tension, character motivation, POV discipline, scene goal/conflict/outcome, and genre conventions for ${pr.genreForConventions}. When you name a craft concept, explain it in one plain sentence. Keep the whole response under 250 words.`,
      temperature: 0.4,
      model: "prose",
      maxTokens: 700,
    },
    specialist: {
      key: "specialist",
      label: "The Specialist",
      tagline: pr.specialistTagline,
      directive: pr.specialistDirective,
      temperature: 0.5,
      model: "prose",
      maxTokens: 600,
    },
    proofreader: {
      key: "proofreader",
      label: "The Proofreader",
      tagline: "Fixes mechanics. Preserves voice.",
      directive: `Fix only: typos, spelling, punctuation, grammar, tense consistency, dropped words, doubled words. Do NOT rewrite, restructure, change word choice, alter rhythm, or adjust style. If the author's usage is a style choice (fragments, sentence rhythm, deliberate repetition, unconventional dialogue tags), leave it alone. Return a JSON object: { "cleaned": "...full cleaned text...", "changes": ["one-bullet description of each change made"] }. No other commentary.`,
      temperature: 0.2,
      model: "prose",
      maxTokens: 2000,
    },
    analyst: {
      key: "analyst",
      label: "The Analyst",
      tagline: "Quick research — names, alternatives, options.",
      directive: `Produce a short structured answer: a list, a set of alternatives, or a single concrete suggestion. No prose. No explanation. Each item under 20 words. Return no more than 8 items.`,
      temperature: 0.9,
      model: "quick",
      maxTokens: 400,
    },
  };
}

export function personaLabel(
  key: PersonaKey,
  aliases: Record<string, string> | null | undefined,
  writingProfileRaw?: string | null,
): string {
  const alias = aliases?.[key];
  if (alias && alias.trim()) return alias;
  if (key === "extract" || key === "factcheck") return key;
  const wp = parseWritingProfile(writingProfileRaw);
  const personas = getPersonas(wp);
  const base = personas[key as CorePersonaKey];
  return base?.label ?? key;
}
