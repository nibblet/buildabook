import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { splitDraftIntoParagraphs } from "@/lib/ai/extract";
import {
  askModel,
  resolveModelFromProject,
} from "@/lib/ai/model";
import { parseWritingProfile } from "@/lib/deployment/writing-profile";
import { supabaseServer } from "@/lib/supabase/server";
import type { Character, WorldElement } from "@/lib/supabase/types";
import {
  ExtractedContinuityResponse,
  type ExtractedClaimRawT,
} from "@/lib/ai/continuity/schemas";
import { parseJsonObject } from "@/lib/ai/continuity/parse-model-json";
import {
  resolveSubject,
  type EntityRow,
} from "@/lib/ai/continuity/resolve-subject";
import {
  contradictionDraftsFromExtractor,
  mergeAnnotationDrafts,
  tierBDraftsFromClaims,
  computeAnnotationDrafts,
  type AnnotationDraft,
  type ClaimForTiering,
  type PriorClaimLite,
} from "@/lib/ai/continuity/tiering";

export const CONTINUITY_EXTRACTOR_VERSION = 1;

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
- Self-report confidence: high if explicitly stated; medium if strongly implied; low if inferred from subtext.
- Use subject_ref_hint ONLY when you mean an existing entity UUID from the PRIOR CLAIMS list (same UUID appears there).
- paragraph_start / paragraph_end are inclusive 0-based indices into the numbered paragraphs below.
- Return ONLY valid JSON (one object, double-quoted keys, no markdown fences).`;
}

function buildUserPrompt(input: {
  paragraphs: string[];
  priorClaimLines: string[];
}): string {
  const numbered = input.paragraphs
    .map((p, i) => `<<<PARAGRAPH_${i}>>>\n${p}`)
    .join("\n\n");

  const prior =
    input.priorClaimLines.length > 0
      ? input.priorClaimLines.join("\n")
      : "(none yet)";

  return `PRIOR CLAIMS (reference by id in contradictions.conflicting_claim_ids only if listed here):
${prior}

CURRENT SCENE (${input.paragraphs.length} paragraphs, indices 0–${Math.max(0, input.paragraphs.length - 1)}):

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
      "confidence": "low | medium | high"
    }
  ],
  "contradictions": [
    {
      "summary": "one sentence — what clashes with earlier canon",
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

/** Post-save pipeline: extract claims + annotations for one scene. */
export async function extractContinuity(sceneId: string): Promise<void> {
  if (!env.continuityEditorEnabled()) return;

  const supabase = await supabaseServer();

  const { data: scene, error: scErr } = await supabase
    .from("scenes")
    .select(
      "id, chapter_id, content, continuity_content_hash, continuity_extractor_version",
    )
    .eq("id", sceneId)
    .maybeSingle();
  if (scErr || !scene) return;

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, project_id")
    .eq("id", scene.chapter_id)
    .maybeSingle();
  if (!chapter) return;

  const { data: project } = await supabase
    .from("projects")
    .select("id, writing_profile")
    .eq("id", chapter.project_id)
    .maybeSingle();
  if (!project) return;

  const html = scene.content ?? "";
  const plain = htmlToPlainForParagraphs(html);
  const paragraphs = splitDraftIntoParagraphs(plain);
  const normalizedBody = paragraphs.join("\n\n");
  const contentHash = createHash("sha256")
    .update(normalizedBody)
    .digest("hex");

  if (
    paragraphs.length === 0 ||
    !normalizedBody.trim()
  ) {
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

  if (
    scene.continuity_content_hash === contentHash &&
    (scene.continuity_extractor_version ?? 0) >= CONTINUITY_EXTRACTOR_VERSION
  ) {
    return;
  }

  const [{ data: chars }, { data: worlds }] = await Promise.all([
    supabase.from("characters").select("id, name, aliases").eq("project_id", chapter.project_id),
    supabase
      .from("world_elements")
      .select("id, name, aliases")
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
    name: (w.name ?? "").trim() || "—",
    aliases: w.aliases,
  }));

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

  await supabase
    .from("continuity_claims")
    .update({
      status: "superseded",
      updated_at: new Date().toISOString(),
    })
    .eq("source_scene_id", sceneId)
    .eq("status", "auto");

  await supabase.from("continuity_annotations").delete().eq("scene_id", sceneId);

  const wp = parseWritingProfile(project.writing_profile);
  const model = resolveModelFromProject(project.writing_profile, "quick");

  let extracted;
  try {
    const { text } = await askModel({
      persona: "continuity_editor",
      system: continuityEditorSystemPrompt(),
      user: buildUserPrompt({ paragraphs, priorClaimLines }),
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

  const claimInserts = extracted.claims.map((c: ExtractedClaimRawT) => {
    const resolved = resolveSubject(
      c.subject_label,
      c.subject_ref_hint,
      entityChars,
      entityWorlds,
    );
    return {
      project_id: chapter.project_id,
      source_scene_id: sceneId,
      source_paragraph_start: c.paragraph_start,
      source_paragraph_end: c.paragraph_end,
      kind: c.kind,
      subject_type: c.subject_type,
      subject_label: c.subject_label,
      subject_character_id: resolved.subject_character_id,
      subject_world_element_id: resolved.subject_world_element_id,
      subject_relationship_id: null as string | null,
      predicate: c.predicate,
      object_text: c.object_text,
      confidence: c.confidence,
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
        paragraph_index: ne.paragraph_start,
        name: nm,
      });
    }
  }

  const newEntityNamesMatchingExisting: {
    name: string;
    paragraph_index: number;
  }[] = [];

  const d1 = computeAnnotationDrafts({
    duplicateNameParagraphs,
    newEntityNamesMatchingExisting,
  });
  const d2 = contradictionDraftsFromExtractor({
    contradictions: extracted.contradictions,
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

  await supabase
    .from("scenes")
    .update({
      continuity_content_hash: contentHash,
      continuity_extracted_at: new Date().toISOString(),
      continuity_extractor_version: CONTINUITY_EXTRACTOR_VERSION,
    })
    .eq("id", sceneId);
}
