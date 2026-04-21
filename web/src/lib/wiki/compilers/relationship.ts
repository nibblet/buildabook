import type { CompiledDoc } from "@/lib/wiki/repo";
import { computeSignature } from "@/lib/wiki/signature";
import type { Relationship } from "@/lib/supabase/types";

export type RelationshipBeatLink = {
  chapter_order: number;
  scene_order: number;
  chapter_title: string | null;
  beat_label: string | null;
  intensity: number | null;
  notes: string | null;
};

export type CompileRelationshipInput = {
  relationship: Relationship;
  charA: { id: string; name: string } | null;
  charB: { id: string; name: string } | null;
  beats: RelationshipBeatLink[];
};

export function compileRelationship(
  input: CompileRelationshipInput,
): CompiledDoc {
  const { relationship: r, charA, charB, beats } = input;

  const aName = charA?.name ?? "Unknown";
  const bName = charB?.name ?? "Unknown";
  const title = `${aName} × ${bName}`;

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- **A:** [[${aName}]]`);
  lines.push(`- **B:** [[${bName}]]`);
  if (r.type) lines.push(`- **Type:** ${r.type}`);
  if (r.current_state) lines.push(`- **Current state:** ${r.current_state}`);
  lines.push("");

  if (r.arc_notes) {
    lines.push("## Arc");
    lines.push(r.arc_notes);
    lines.push("");
  }

  const ordered = [...beats].sort(
    (a, b) =>
      a.chapter_order - b.chapter_order || a.scene_order - b.scene_order,
  );

  if (ordered.length) {
    lines.push("## Intensity curve");
    for (const b of ordered) {
      const chTitle = b.chapter_title || `Chapter ${b.chapter_order + 1}`;
      const intensity =
        typeof b.intensity === "number"
          ? ` [${b.intensity >= 0 ? "+" : ""}${b.intensity}]`
          : "";
      const label = b.beat_label ? ` — ${b.beat_label}` : "";
      const note = b.notes ? ` · ${b.notes}` : "";
      lines.push(`- ${chTitle}${intensity}${label}${note}`);
    }
    lines.push("");
  }

  const signaturePayload = {
    relationship: {
      id: r.id,
      type: r.type,
      current_state: r.current_state,
      arc_notes: r.arc_notes,
      char_a_id: r.char_a_id,
      char_b_id: r.char_b_id,
    },
    a_name: aName,
    b_name: bName,
    beats: ordered.map((b) => ({
      chapter_order: b.chapter_order,
      scene_order: b.scene_order,
      beat_label: b.beat_label,
      intensity: b.intensity,
      notes: b.notes,
    })),
  };

  return {
    title,
    bodyMd: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    sourceSignature: computeSignature(signaturePayload),
    sourceRefs: {
      relationship_id: r.id,
      char_a_id: r.char_a_id,
      char_b_id: r.char_b_id,
    },
  };
}
