import type { ContinuityClaim } from "@/lib/supabase/types";

/** Minimal shape for Tier B rules (avoids requiring full DB row). */
export type ClaimForTiering = Pick<
  ContinuityClaim,
  | "id"
  | "kind"
  | "status"
  | "source_paragraph_start"
  | "subject_label"
  | "predicate"
  | "object_text"
  | "confidence"
  | "subject_type"
>;

export type AnnotationDraft = {
  paragraph_index: number;
  tier: "A" | "B" | "C";
  kind:
    | "contradiction"
    | "new_entity"
    | "new_attribute"
    | "relationship_shift"
    | "timeline"
    | "duplicate_name";
  summary: string;
  detail: string;
  claim_ids: string[];
  conflicting_claim_ids: string[];
};

const SIGNIFICANT_PREDICATES = new Set([
  "fears",
  "wound",
  "desire",
  "need",
  "loves",
  "hates",
  "distrusts",
  "trusts",
  "betrays",
  "forgives",
  "secret",
  "power",
  "powers",
  "relationship_shift",
]);

/** Prior confirmed claims keyed by id (for contradiction tiering). */
export type PriorClaimLite = {
  id: string;
  status: string;
  confidence: string;
};

export function computeAnnotationDrafts(input: {
  duplicateNameParagraphs: { paragraph_index: number; name: string }[];
  newEntityNamesMatchingExisting?: { name: string; paragraph_index: number }[];
}): AnnotationDraft[] {
  const drafts: AnnotationDraft[] = [];

  for (const d of input.duplicateNameParagraphs) {
    drafts.push({
      paragraph_index: d.paragraph_index,
      tier: "A",
      kind: "duplicate_name",
      summary: `"${d.name}" may collide with an existing cast member — same person?`,
      detail: `Check whether this is the same character you already track, or a different person who shares the name.`,
      claim_ids: [],
      conflicting_claim_ids: [],
    });
  }

  for (const ne of input.newEntityNamesMatchingExisting ?? []) {
    drafts.push({
      paragraph_index: ne.paragraph_index,
      tier: "A",
      kind: "duplicate_name",
      summary: `New name "${ne.name}" matches someone already in the bible.`,
      detail: `If this is the same character, no action needed. If it is a second person named ${ne.name}, consider renaming one for clarity.`,
      claim_ids: [],
      conflicting_claim_ids: [],
    });
  }

  return dedupeDrafts(drafts);
}

/** Build contradiction annotations from extractor output + DB prior rows. */
export function contradictionDraftsFromExtractor(input: {
  contradictions: {
    summary: string;
    conflicting_claim_ids: string[];
    paragraph_start: number;
    paragraph_end: number;
  }[];
  priorById: Map<string, PriorClaimLite>;
}): AnnotationDraft[] {
  const out: AnnotationDraft[] = [];
  for (const c of input.contradictions) {
    let tier: "A" | "B" = "B";
    for (const id of c.conflicting_claim_ids) {
      const p = input.priorById.get(id);
      if (p?.status === "confirmed" && p.confidence === "high") {
        tier = "A";
        break;
      }
    }
    out.push({
      paragraph_index: c.paragraph_start,
      tier,
      kind: "contradiction",
      summary: c.summary.slice(0, 200),
      detail: c.summary,
      claim_ids: [],
      conflicting_claim_ids: c.conflicting_claim_ids,
    });
  }
  return out;
}

/** Tier B drafts for new-entity introductions and significant attributes. */
export function tierBDraftsFromClaims(claims: ClaimForTiering[]): AnnotationDraft[] {
  const drafts: AnnotationDraft[] = [];

  for (const cl of claims) {
    if (cl.status === "superseded") continue;
    const pIdx = cl.source_paragraph_start;

    if (cl.kind === "entity_introduction") {
      drafts.push({
        paragraph_index: pIdx,
        tier: "B",
        kind: "new_entity",
        summary: `New: ${cl.subject_label || "entity"}`,
        detail: cl.object_text || cl.predicate,
        claim_ids: [cl.id],
        conflicting_claim_ids: [],
      });
      continue;
    }

    if (
      cl.confidence === "low" ||
      !["attribute", "relationship"].includes(cl.kind)
    ) {
      continue;
    }

    const pred = cl.predicate.toLowerCase();
    if (
      SIGNIFICANT_PREDICATES.has(pred) ||
      (cl.confidence === "high" && cl.kind === "attribute")
    ) {
      const kind =
        cl.kind === "relationship" ? "relationship_shift" : "new_attribute";
      drafts.push({
        paragraph_index: pIdx,
        tier: "B",
        kind,
        summary: `${cl.subject_label}: ${pred} — ${cl.object_text}`.slice(0, 180),
        detail: `${cl.subject_label} — ${pred}: ${cl.object_text}`,
        claim_ids: [cl.id],
        conflicting_claim_ids: [],
      });
    }
  }

  return dedupeDrafts(drafts);
}

function dedupeDrafts(drafts: AnnotationDraft[]): AnnotationDraft[] {
  const seen = new Set<string>();
  const out: AnnotationDraft[] = [];
  for (const d of drafts) {
    const k = `${d.paragraph_index}:${d.kind}:${d.summary}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

export function mergeAnnotationDrafts(
  ...groups: AnnotationDraft[][]
): AnnotationDraft[] {
  return dedupeDrafts(groups.flat());
}
