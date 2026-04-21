import type { CompiledDoc } from "@/lib/wiki/repo";
import { computeSignature } from "@/lib/wiki/signature";
import type { Character } from "@/lib/supabase/types";

export type CharacterAppearance = {
  scene_id: string;
  chapter_id: string;
  chapter_order: number;
  scene_order: number;
  chapter_title: string | null;
  goal: string | null;
  conflict: string | null;
  outcome: string | null;
};

export type CharacterRelation = {
  other_name: string;
  type: string | null;
  current_state: string | null;
};

export type CharacterBeatLink = {
  title: string;
  act: number | null;
  why_it_matters: string | null;
};

export type CompileCharacterInput = {
  character: Character;
  appearances: CharacterAppearance[];
  relationships: CharacterRelation[];
  beats: CharacterBeatLink[];
};

export function compileCharacter(input: CompileCharacterInput): CompiledDoc {
  const { character: c, appearances, relationships, beats } = input;

  const orderedAppearances = [...appearances].sort(
    (a, b) =>
      a.chapter_order - b.chapter_order || a.scene_order - b.scene_order,
  );

  const lines: string[] = [];
  lines.push(`# ${c.name || "Untitled"}`);
  lines.push("");

  const meta: string[] = [];
  if (c.role) meta.push(`**Role:** ${c.role}`);
  if (c.species) meta.push(`**Species:** ${c.species}`);
  if (c.archetype) meta.push(`**Archetype:** ${c.archetype}`);
  if (c.aliases?.length) meta.push(`**Also known as:** ${c.aliases.join(", ")}`);
  if (meta.length) {
    lines.push(meta.join("  "));
    lines.push("");
  }

  if (c.appearance) {
    lines.push("## Appearance");
    lines.push(c.appearance);
    lines.push("");
  }

  const drives: string[] = [];
  if (c.wound) drives.push(`- **Wound:** ${c.wound}`);
  if (c.desire) drives.push(`- **Desire:** ${c.desire}`);
  if (c.need) drives.push(`- **Need:** ${c.need}`);
  if (drives.length) {
    lines.push("## Drives");
    lines.push(...drives);
    lines.push("");
  }

  if (c.voice_notes) {
    lines.push("## Voice");
    lines.push(c.voice_notes);
    lines.push("");
  }

  if (c.backstory) {
    lines.push("## Backstory");
    lines.push(c.backstory);
    lines.push("");
  }

  if (c.powers) {
    lines.push("## Powers");
    lines.push(c.powers);
    lines.push("");
  }

  if (relationships.length) {
    lines.push("## Relationships");
    for (const r of relationships) {
      const t = r.type ? ` — ${r.type}` : "";
      const state = r.current_state ? ` (${r.current_state})` : "";
      lines.push(`- [[${r.other_name}]]${t}${state}`);
    }
    lines.push("");
  }

  if (beats.length) {
    lines.push("## Beats this character anchors");
    for (const b of beats) {
      const act = b.act ? ` (Act ${b.act})` : "";
      const why = b.why_it_matters ? ` — ${b.why_it_matters}` : "";
      lines.push(`- ${b.title}${act}${why}`);
    }
    lines.push("");
  }

  if (orderedAppearances.length) {
    lines.push("## Appearances");
    for (const a of orderedAppearances) {
      const title = a.chapter_title || `Chapter ${a.chapter_order + 1}`;
      const goal = a.goal ? ` goal: ${a.goal}` : "";
      const conflict = a.conflict ? ` · conflict: ${a.conflict}` : "";
      const outcome = a.outcome ? ` · outcome: ${a.outcome}` : "";
      lines.push(`- ${title}${goal}${conflict}${outcome}`);
    }
    lines.push("");
  }

  const signaturePayload = {
    character: {
      id: c.id,
      name: c.name,
      role: c.role,
      species: c.species,
      archetype: c.archetype,
      appearance: c.appearance,
      backstory: c.backstory,
      wound: c.wound,
      desire: c.desire,
      need: c.need,
      voice_notes: c.voice_notes,
      powers: c.powers,
      aliases: [...(c.aliases ?? [])].sort(),
    },
    appearances: orderedAppearances.map((a) => ({
      scene_id: a.scene_id,
      chapter_id: a.chapter_id,
      chapter_order: a.chapter_order,
      scene_order: a.scene_order,
      goal: a.goal,
      conflict: a.conflict,
      outcome: a.outcome,
    })),
    relationships: [...relationships].sort((a, b) =>
      a.other_name.localeCompare(b.other_name),
    ),
    beats: [...beats].sort((a, b) => a.title.localeCompare(b.title)),
  };

  return {
    title: c.name || "Untitled",
    bodyMd: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    sourceSignature: computeSignature(signaturePayload),
    sourceRefs: {
      character_id: c.id,
      scene_ids: orderedAppearances.map((a) => a.scene_id),
    },
  };
}
