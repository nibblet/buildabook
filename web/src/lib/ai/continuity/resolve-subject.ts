export type EntityRow = {
  id: string;
  name: string;
  aliases: string[] | null;
};

export type SubjectCandidate = {
  type: "character" | "world_element";
  id: string;
  label: string;
  reason: "first_name" | "alias" | "partial";
};

export type SubjectResolution = {
  subject_character_id: string | null;
  subject_world_element_id: string | null;
  resolution_status: "resolved" | "candidate" | "ambiguous" | "unresolved";
  resolution_note: string | null;
  candidates: SubjectCandidate[];
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstToken(s: string): string {
  return norm(s).split(" ")[0] ?? "";
}

function resolvedCharacter(id: string): SubjectResolution {
  return {
    subject_character_id: id,
    subject_world_element_id: null,
    resolution_status: "resolved",
    resolution_note: null,
    candidates: [],
  };
}

function resolvedWorld(id: string): SubjectResolution {
  return {
    subject_character_id: null,
    subject_world_element_id: id,
    resolution_status: "resolved",
    resolution_note: null,
    candidates: [],
  };
}

function unresolved(): SubjectResolution {
  return {
    subject_character_id: null,
    subject_world_element_id: null,
    resolution_status: "unresolved",
    resolution_note: null,
    candidates: [],
  };
}

/** Match label or hint UUID against characters / world elements. */
export function resolveSubject(
  subjectLabel: string,
  subjectRefHint: string | null | undefined,
  characters: EntityRow[],
  worldElements: EntityRow[],
): SubjectResolution {
  if (subjectRefHint) {
    const ch = characters.find((c) => c.id === subjectRefHint);
    if (ch) return resolvedCharacter(ch.id);
    const w = worldElements.find((e) => e.id === subjectRefHint);
    if (w) return resolvedWorld(w.id);
  }

  const n = norm(subjectLabel);
  if (!n) return unresolved();

  const chMatch = characters.find((c) => norm(c.name) === n);
  if (chMatch) return resolvedCharacter(chMatch.id);
  const chAlias = characters.find((c) =>
    (c.aliases ?? []).some((a) => norm(a) === n),
  );
  if (chAlias) return resolvedCharacter(chAlias.id);

  const wMatch = worldElements.find((e) => e.name && norm(e.name) === n);
  if (wMatch) return resolvedWorld(wMatch.id);
  const wAlias = worldElements.find((e) =>
    (e.aliases ?? []).some((a) => norm(a) === n),
  );
  if (wAlias) return resolvedWorld(wAlias.id);

  const characterCandidates = characters
    .filter((c) => firstToken(c.name) === n)
    .map<SubjectCandidate>((c) => ({
      type: "character",
      id: c.id,
      label: c.name,
      reason: "first_name",
    }));

  if (characterCandidates.length === 1) {
    return {
      subject_character_id: null,
      subject_world_element_id: null,
      resolution_status: "candidate",
      resolution_note: `Possible character match: ${characterCandidates[0].label}`,
      candidates: characterCandidates,
    };
  }

  if (characterCandidates.length > 1) {
    return {
      subject_character_id: null,
      subject_world_element_id: null,
      resolution_status: "ambiguous",
      resolution_note: `Multiple possible character matches: ${characterCandidates
        .map((c) => c.label)
        .join(", ")}`,
      candidates: characterCandidates,
    };
  }

  return unresolved();
}
