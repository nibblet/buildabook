export type EntityRow = {
  id: string;
  name: string;
  aliases: string[] | null;
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Match label or hint UUID against characters / world elements. */
export function resolveSubject(
  subjectLabel: string,
  subjectRefHint: string | null | undefined,
  characters: EntityRow[],
  worldElements: EntityRow[],
): {
  subject_character_id: string | null;
  subject_world_element_id: string | null;
} {
  if (subjectRefHint) {
    const ch = characters.find((c) => c.id === subjectRefHint);
    if (ch) return { subject_character_id: ch.id, subject_world_element_id: null };
    const w = worldElements.find((e) => e.id === subjectRefHint);
    if (w) return { subject_character_id: null, subject_world_element_id: w.id };
  }

  const n = norm(subjectLabel);
  if (!n) return { subject_character_id: null, subject_world_element_id: null };

  const chMatch = characters.find((c) => norm(c.name) === n);
  if (chMatch) return { subject_character_id: chMatch.id, subject_world_element_id: null };
  const chAlias = characters.find((c) =>
    (c.aliases ?? []).some((a) => norm(a) === n),
  );
  if (chAlias) return { subject_character_id: chAlias.id, subject_world_element_id: null };

  const wMatch = worldElements.find((e) => e.name && norm(e.name) === n);
  if (wMatch) return { subject_character_id: null, subject_world_element_id: wMatch.id };
  const wAlias = worldElements.find((e) =>
    (e.aliases ?? []).some((a) => norm(a) === n),
  );
  if (wAlias) return { subject_character_id: null, subject_world_element_id: wAlias.id };

  return { subject_character_id: null, subject_world_element_id: null };
}
