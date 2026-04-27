export type RelationshipPairRow = {
  id: string;
  char_a_id: string | null;
  char_b_id: string | null;
};

export function relationshipPairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export function findRelationshipForPair(
  relationships: RelationshipPairRow[],
  charAId: string | null,
  charBId: string | null,
): RelationshipPairRow | null {
  if (!charAId || !charBId || charAId === charBId) return null;

  const target = relationshipPairKey(charAId, charBId);
  return (
    relationships.find((r) => {
      if (!r.char_a_id || !r.char_b_id) return false;
      return relationshipPairKey(r.char_a_id, r.char_b_id) === target;
    }) ?? null
  );
}
