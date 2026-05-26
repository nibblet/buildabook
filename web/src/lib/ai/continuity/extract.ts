// On-demand continuity extraction — scoped to user-selected paragraph ranges or full scene (codex batch).

import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { splitDraftIntoParagraphs } from "@/lib/prose/split-paragraphs";
import {
  askModel,
  resolveModelFromProject,
} from "@/lib/ai/model";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import { supabaseServer } from "@/lib/supabase/server";
import type { Character, Relationship, WorldElement } from "@/lib/supabase/types";
import {
  ExtractedContinuityResponse,
  type ExtractedClaimRawT,
} from "@/lib/ai/continuity/schemas";
import { parseJsonObject } from "@/lib/ai/continuity/parse-model-json";
import {
  resolveSubject,
  type EntityRow,
} from "@/lib/ai/continuity/resolve-subject";
import { findRelationshipForPair } from "@/lib/ai/continuity/resolve-relationship";
import {
  contradictionDraftsFromExtractor,
  mergeAnnotationDrafts,
  tierBDraftsFromClaims,
  computeAnnotationDrafts,
  type AnnotationDraft,
  type ClaimForTiering,
  type PriorClaimLite,
} from "@/lib/ai/continuity/tiering";
import {
  paragraphRangesOverlap,
  validateParagraphRange,
} from "@/lib/ai/continuity/paragraph-range";

export const CONTINUITY_EXTRACTOR_VERSION = 2;

export type ExtractContinuityOptions = {
  paragraphStart: number;
  paragraphEnd: number;
  /** When true, update scenes.continuity_content_hash (full-scene codex rerun only). */
  updateContentHash?: boolean;
  /** When true, skip hash-based early exit (codex batch rerun). */
  force?: boolean;
};

export type ExtractContinuityResult = {
  claimCount: number;
  annotationCount: number;
};

function htmlToPlainForParagraphs(html: string): string {
  return html
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function continuityEditorSystemPrompt(): string {
  return `You are the Continuity Editor, a silent assistant who reads one scene at a time as the author writes. Extract atomic, grounded facts as claims so the story bible stays consistent.

Rules:
- Every claim must be directly supported by the numbered paragraphs. Prefer NO claim over a guess.
- Be selective: emit fewer, higher-value claims. Skip filler, stage direction, and one-off gestures unless they encode lasting plot or relationship truth.
- Self-report confidence: high if explicitly stated; medium if strongly implied; low if inferred from subtext.
- Prioritize canon-worthy continuity: identity, introductions, relationship state, world rules and magic, factions/locations, durable traits and obligations.
- Use kind "event" sparingly — only for plot-significant beats worth tracking across chapters (reveals, binding choices, violence with lasting stakes). Omit routine blocking and micro-actions.
- Transient choreography/body-position beats ("nods", "leans", "presses", "steps") are not continuity unless tied to a lasting emotional or plot consequence — omit them or use very low confidence.
- Use subject_ref_hint ONLY when you mean an existing entity UUID from the ENTITY INDEX.
- paragraph_start / paragraph_end are inclusive 0-based indices into the numbered paragraphs below.
- Return ONLY valid JSON (one object, double-quoted keys, no markdown fences).`;
}

function isLikelyTransientNoise(claim: ExtractedClaimRawT): boolean {
  const genericSubjects = new Set([
    "air",
    "room",
    "hall",
    "stage",
    "light",
    "music",
    "sound",
  ]);
  const transientPredicates = new Set([
    "nods",
    "nod",
    "leans",
    "lean",
    "presses",
    "press",
    "braced",
    "collapses",
    "collapsed",
    "tightens",
    "tightened",
    "whispered",
    "flicked",
    "gripped",
    "straddled",
    "feels",
    "says",
    "stands",
    "looses",
    "loosens",
  ]);
  const subject = claim.subject_label.trim().toLowerCase();
  const predicate = claim.predicate.trim().toLowerCase();
  if (genericSubjects.has(subject)) return true;
  if (claim.kind === "event" && transientPredicates.has(predicate)) return true;
  return false;
}

function normalizeClaimConfidence(
  claim: ExtractedClaimRawT,
): "low" | "medium" | "high" {
  if (isLikelyTransientNoise(claim)) {
    if (claim.subject_type === "unknown" || claim.subject_type === "scene") {
      return "low";
    }
    return claim.confidence === "high" ? "medium" : claim.confidence;
  }
  return claim.confidence;
}

/** Drops low-signal claims before insert so Codex review stays bible-shaped. */
export function shouldInsertContinuityClaim(
  claim: ExtractedClaimRawT,
): boolean {
  if (claim.kind === "event") {
    if (claim.confidence === "low") return false;
    if (isLikelyTransientNoise(claim)) return false;
    if (
      (claim.subject_type === "unknown" || claim.subject_type === "scene") &&
      claim.confidence !== "high"
    ) {
      return false;
    }
  }
  return true;
}

function buildUserPrompt(input: {
  paragraphs: string[];
  priorClaimLines: string[];
  entityIndexLines: string[];
}): string {
  const numbered = input.paragraphs
    .map((p, i) => `<<<PARAGRAPH_${i}>>>\n${p}`)
    .join("\n\n");

  const prior =
    input.priorClaimLines.length > 0
      ? input.priorClaimLines.join("\n")
      : "(none yet)";

  const entityIndex =
    input.entityIndexLines.length > 0
      ? input.entityIndexLines.join("\n")
      : "(none yet)";

  return `ENTITY INDEX (use these ids in subject_ref_hint when the claim is clearly about an existing entity):
${entityIndex}

PRIOR CLAIMS (reference by id in contradictions.conflicting_claim_ids only if listed here):
${prior}

CURRENT SCENE (${input.paragraphs.length} paragraphs, indices 0-${Math.max(0, input.paragraphs.length - 1)}):

${numbered}

Return a single JSON object:
{
  "claims": [
    {
      "kind": "attribute | relationship | event | world_rule | entity_introduction",
      "subject_type": "character | world_element | relationship | scene | unknown",
      "subject_label": "short name",
      "subject_ref_hint": "optional uuid from PRIOR CLAIMS list or null",
      "predicate": "short verb token, e.g. fears, distrusts, located_in, rule",
      "object_text": "what the prose supports",
      "paragraph_start": 0,
      "paragraph_end": 0,
      "confidence": "low | medium | high",
      "proposed_world_category": "optional category when subject_type is world_element",
      "relationship_character_labels": ["first character name", "second character name"]
    }
  ],
  "contradictions": [
    {
      "summary": "one sentence - what clashes with earlier canon",
      "conflicting_claim_ids": ["uuid-from-prior-list"],
      "paragraph_start": 0,
      "paragraph_end": 0,
      "confidence": "low | medium | high"
    }
  ],
  "new_entities": [
    {
      "name": "proper name introduced",
      "kind": "character | world_element",
      "category": "optional for world_element",
      "paragraph_start": 0,
      "paragraph_end": 0
    }
  ]
}

If nothing is extractable, return {"claims":[],"contradictions":[],"new_entities":[]}.`;
}

/** Extract claims + annotations for a paragraph range within one scene (on-demand). */
export async function extractContinuityRange(
  sceneId: string,
  options: ExtractContinuityOptions,
): Promise<ExtractContinuityResult> {
  const empty: ExtractContinuityResult = { claimCount: 0, annotationCount: 0 };
  if (!env.continuityEditorEnabled()) return empty;

  const { paragraphStart, paragraphEnd, updateContentHash = false, force = false } =
    options;

  const supabase = await supabaseServer();

  const { data: scene, error: scErr } = await supabase
    .from("scenes")
    .select(
      "id, chapter_id, content, continuity_content_hash, continuity_extractor_version",
    )
    .eq("id", sceneId)
    .maybeSingle();
  if (scErr || !scene) return empty;

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, project_id")
    .eq("id", scene.chapter_id)
    .maybeSingle();
  if (!chapter) return empty;

  const { data: project } = await supabase
    .from("projects")
    .select("id, writing_profile")
    .eq("id", chapter.project_id)
    .maybeSingle();
  if (!project) return empty;

  const html = scene.content ?? "";
  const plain = htmlToPlainForParagraphs(html);
  const allParagraphs = splitDraftIntoParagraphs(plain);
  const normalizedBody = allParagraphs.join("\n\n");
  const contentHash = createHash("sha256")
    .update(normalizedBody)
    .digest("hex");

  const rangeCheck = validateParagraphRange(
    allParagraphs,
    paragraphStart,
    paragraphEnd,
  );
  if (!rangeCheck.ok) {
    throw new Error(rangeCheck.error);
  }

  const isFullScene =
    paragraphStart === 0 && paragraphEnd === allParagraphs.length - 1;

  if (
    isFullScene &&
    !force &&
    scene.continuity_content_hash === contentHash &&
    (scene.continuity_extractor_version ?? 0) >= CONTINUITY_EXTRACTOR_VERSION
  ) {
    return empty;
  }

  const rangeParagraphs = allParagraphs.slice(paragraphStart, paragraphEnd + 1);
  const paragraphOffset = paragraphStart;

  const [{ data: chars }, { data: worlds }, { data: relationships }] =
    await Promise.all([
      supabase
        .from("characters")
        .select("id, name, aliases")
        .eq("project_id", chapter.project_id),
      supabase
        .from("world_elements")
        .select("id, name, category, aliases")
        .eq("project_id", chapter.project_id),
      supabase
        .from("relationships")
        .select("id, char_a_id, char_b_id")
        .eq("project_id", chapter.project_id),
    ]);

  const charRows = (chars ?? []) as Character[];
  const worldRows = (worlds ?? []) as WorldElement[];
  const entityChars: EntityRow[] = charRows.map((c) => ({
    id: c.id,
    name: c.name,
    aliases: c.aliases,
  }));
  const entityWorlds: EntityRow[] = worldRows.map((w) => ({
    id: w.id,
    name: (w.name ?? "").trim() || "-",
    aliases: w.aliases,
  }));
  const relationshipRows = (relationships ?? []) as Relationship[];
  const entityIndexLines = [
    ...charRows.map((c) => {
      const aliases = (c.aliases ?? []).length
        ? ` aliases=${c.aliases.join(", ")}`
        : "";
      return `character | ${c.id} | ${c.name}${aliases}`;
    }),
    ...worldRows.map((w) => {
      const aliases = (w.aliases ?? []).length
        ? ` aliases=${w.aliases.join(", ")}`
        : "";
      const category = w.category ? ` category=${w.category}` : "";
      return `world_element | ${w.id} | ${w.name ?? "Unnamed"}${category}${aliases}`;
    }),
  ];

  const { data: priorRows } = await supabase
    .from("continuity_claims")
    .select("id, status, confidence, subject_label, predicate, object_text, created_at")
    .eq("project_id", chapter.project_id)
    .neq("status", "superseded")
    .order("created_at", { ascending: false })
    .limit(60);

  const priorClaimLines =
    priorRows?.map(
      (r) =>
        `${r.id} | ${r.status} | ${r.confidence} | ${r.subject_label}: ${r.predicate} → ${r.object_text}`,
    ) ?? [];

  const priorById = new Map<string, PriorClaimLite>();
  for (const r of priorRows ?? []) {
    priorById.set(r.id, {
      id: r.id,
      status: r.status,
      confidence: r.confidence,
    });
  }

  const wp = parseWritingProfile(project.writing_profile);
  const model = resolveModelFromProject(project.writing_profile, "quick");

  let extracted;
  try {
    const { text } = await askModel({
      persona: "continuity_editor",
      system: continuityEditorSystemPrompt(),
      user: buildUserPrompt({
        paragraphs: rangeParagraphs,
        priorClaimLines,
        entityIndexLines,
      }),
      model,
      temperature: 0.15,
      maxTokens: 8192,
      projectId: chapter.project_id,
      contextType: "continuity",
      contextId: sceneId,
      writingProfile: wp,
    });
    extracted = ExtractedContinuityResponse.parse(parseJsonObject(text));
  } catch (e) {
    console.error("extractContinuity LLM:", e);
    throw e instanceof Error ? e : new Error("Continuity extraction failed.");
  }

  const claimsToStore = extracted.claims.filter(shouldInsertContinuityClaim);

  // Range-scoped merge: supersede overlapping auto claims only.
  const { data: existingAutoClaims } = await supabase
    .from("continuity_claims")
    .select("id, source_paragraph_start, source_paragraph_end")
    .eq("source_scene_id", sceneId)
    .eq("status", "auto");

  const idsToSupersede = (existingAutoClaims ?? [])
    .filter((row) => {
      const cStart = row.source_paragraph_start ?? 0;
      const cEnd = row.source_paragraph_end ?? cStart;
      return paragraphRangesOverlap(
        cStart,
        cEnd,
        paragraphStart,
        paragraphEnd,
      );
    })
    .map((row) => row.id);

  if (idsToSupersede.length > 0) {
    await supabase
      .from("continuity_claims")
      .update({
        status: "superseded",
        updated_at: new Date().toISOString(),
      })
      .in("id", idsToSupersede);
  }

  const { data: existingAnnotations } = await supabase
    .from("continuity_annotations")
    .select("id, paragraph_index")
    .eq("scene_id", sceneId);

  const annotationIdsToDelete = (existingAnnotations ?? [])
    .filter(
      (a) =>
        a.paragraph_index >= paragraphStart && a.paragraph_index <= paragraphEnd,
    )
    .map((a) => a.id);

  if (annotationIdsToDelete.length > 0) {
    await supabase
      .from("continuity_annotations")
      .delete()
      .in("id", annotationIdsToDelete);
  }

  const claimInserts = claimsToStore.map((c: ExtractedClaimRawT) => {
    const globalStart = c.paragraph_start + paragraphOffset;
    const globalEnd = c.paragraph_end + paragraphOffset;

    const resolved = resolveSubject(
      c.subject_label,
      c.subject_ref_hint,
      entityChars,
      entityWorlds,
    );
    const relationshipCharacterIds = c.relationship_character_labels
      .map((label) =>
        resolveSubject(label, null, entityChars, entityWorlds)
          .subject_character_id,
      )
      .filter((id): id is string => Boolean(id));
    const relationship =
      c.subject_type === "relationship"
        ? findRelationshipForPair(
            relationshipRows,
            relationshipCharacterIds[0] ?? null,
            relationshipCharacterIds[1] ?? null,
          )
        : null;
    const proposedDestinationType =
      c.subject_type === "relationship"
        ? "relationship"
        : c.subject_type === "world_element"
          ? "world_element"
          : c.subject_type === "character"
            ? "character"
            : c.subject_type === "scene"
              ? "scene"
              : "unresolved";

    return {
      project_id: chapter.project_id,
      source_scene_id: sceneId,
      source_paragraph_start: globalStart,
      source_paragraph_end: globalEnd,
      kind: c.kind,
      subject_type: c.subject_type,
      subject_label: c.subject_label,
      subject_character_id: resolved.subject_character_id,
      subject_world_element_id: resolved.subject_world_element_id,
      subject_relationship_id: relationship?.id ?? null,
      proposed_destination_type: proposedDestinationType,
      proposed_world_category: c.proposed_world_category ?? null,
      resolution_status: relationship
        ? "resolved"
        : resolved.resolution_status,
      resolution_note: relationship ? null : resolved.resolution_note,
      predicate: c.predicate,
      object_text: c.object_text,
      confidence: normalizeClaimConfidence(c),
      status: "auto" as const,
      superseded_by: null as string | null,
      tier: null as string | null,
      extractor_version: CONTINUITY_EXTRACTOR_VERSION,
    };
  });

  type InsertedClaimRow = {
    id: string;
    kind: string;
    subject_label: string;
    predicate: string;
    object_text: string;
    confidence: string;
    status: string;
    source_paragraph_start: number;
    subject_type: string;
  };

  let insertedClaimRows: InsertedClaimRow[] = [];

  if (claimInserts.length > 0) {
    const { data: ins, error: insErr } = await supabase
      .from("continuity_claims")
      .insert(claimInserts)
      .select(
        "id, kind, subject_label, predicate, object_text, confidence, status, source_paragraph_start, subject_type",
      );
    if (insErr) console.error("continuity_claims insert:", insErr);
    insertedClaimRows = (ins ?? []) as InsertedClaimRow[];
  }

  const claimsForTiering: ClaimForTiering[] = insertedClaimRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    subject_label: r.subject_label,
    predicate: r.predicate,
    object_text: r.object_text,
    confidence: r.confidence as ClaimForTiering["confidence"],
    status: r.status as ClaimForTiering["status"],
    source_paragraph_start: r.source_paragraph_start,
    subject_type: r.subject_type,
  }));

  const nameSet = new Set(
    charRows.map((c) => c.name.trim().toLowerCase()).filter(Boolean),
  );
  const duplicateNameParagraphs: { paragraph_index: number; name: string }[] =
    [];
  for (const ne of extracted.new_entities) {
    const nm = ne.name.trim();
    if (nameSet.has(nm.toLowerCase())) {
      duplicateNameParagraphs.push({
        paragraph_index: ne.paragraph_start + paragraphOffset,
        name: nm,
      });
    }
  }

  const newEntityNamesMatchingExisting: {
    name: string;
    paragraph_index: number;
  }[] = [];

  const contradictionsWithOffset = extracted.contradictions.map((c) => ({
    ...c,
    paragraph_start: c.paragraph_start + paragraphOffset,
    paragraph_end: c.paragraph_end + paragraphOffset,
  }));

  const d1 = computeAnnotationDrafts({
    duplicateNameParagraphs,
    newEntityNamesMatchingExisting,
  });
  const d2 = contradictionDraftsFromExtractor({
    contradictions: contradictionsWithOffset,
    priorById,
  });
  const d3 = tierBDraftsFromClaims(claimsForTiering);

  const allDrafts = mergeAnnotationDrafts(d1, d2, d3);

  const annRows = allDrafts.map((a: AnnotationDraft) => ({
    project_id: chapter.project_id,
    scene_id: sceneId,
    paragraph_index: a.paragraph_index,
    tier: a.tier,
    kind: a.kind,
    summary: a.summary,
    detail: a.detail,
    claim_ids: a.claim_ids,
    conflicting_claim_ids: a.conflicting_claim_ids,
    status: "shown",
    dismissed_session_id: null as string | null,
  }));

  if (annRows.length > 0) {
    const { error: anErr } = await supabase
      .from("continuity_annotations")
      .insert(annRows);
    if (anErr) console.error("continuity_annotations insert:", anErr);
  }

  if (updateContentHash && isFullScene) {
    await supabase
      .from("scenes")
      .update({
        continuity_content_hash: contentHash,
        continuity_extracted_at: new Date().toISOString(),
        continuity_extractor_version: CONTINUITY_EXTRACTOR_VERSION,
      })
      .eq("id", sceneId);
  }

  return {
    claimCount: insertedClaimRows.length,
    annotationCount: annRows.length,
  };
}

/** Full-scene extraction (codex batch rerun). */
export async function extractContinuity(sceneId: string): Promise<void> {
  if (!env.continuityEditorEnabled()) return;

  const supabase = await supabaseServer();
  const { data: scene } = await supabase
    .from("scenes")
    .select("content")
    .eq("id", sceneId)
    .maybeSingle();
  if (!scene) return;

  const plain = htmlToPlainForParagraphs(scene.content ?? "");
  const paragraphs = splitDraftIntoParagraphs(plain);

  if (paragraphs.length === 0 || !paragraphs.some((p) => p.trim())) {
    const contentHash = createHash("sha256")
      .update(paragraphs.join("\n\n"))
      .digest("hex");
    await supabase
      .from("scenes")
      .update({
        continuity_content_hash: contentHash,
        continuity_extracted_at: new Date().toISOString(),
        continuity_extractor_version: CONTINUITY_EXTRACTOR_VERSION,
      })
      .eq("id", sceneId);
    return;
  }

  await extractContinuityRange(sceneId, {
    paragraphStart: 0,
    paragraphEnd: paragraphs.length - 1,
    updateContentHash: true,
    force: true,
  });
}
