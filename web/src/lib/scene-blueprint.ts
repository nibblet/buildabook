export type SceneBlueprint = {
  intent?: string;
  reader_takeaway?: string;
  character_shift?: string;
  research_notes?: string;
  updated_at?: string;
};

export const EMPTY_BLUEPRINT: SceneBlueprint = {};

export function parseSceneBlueprint(value: unknown): SceneBlueprint {
  if (!value || typeof value !== "object") return EMPTY_BLUEPRINT;
  const raw = value as Record<string, unknown>;
  const out: SceneBlueprint = {};
  if (typeof raw.intent === "string") out.intent = raw.intent;
  if (typeof raw.reader_takeaway === "string")
    out.reader_takeaway = raw.reader_takeaway;
  if (typeof raw.character_shift === "string")
    out.character_shift = raw.character_shift;
  if (typeof raw.research_notes === "string")
    out.research_notes = raw.research_notes;
  if (typeof raw.updated_at === "string") out.updated_at = raw.updated_at;
  return out;
}

export function blueprintIsEmpty(b: SceneBlueprint | null | undefined): boolean {
  if (!b) return true;
  return (
    !b.intent?.trim() &&
    !b.reader_takeaway?.trim() &&
    !b.character_shift?.trim() &&
    !b.research_notes?.trim()
  );
}
