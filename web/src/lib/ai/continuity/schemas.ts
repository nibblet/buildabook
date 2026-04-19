import { z } from "zod";

export const ExtractedClaimRaw = z.object({
  kind: z.enum([
    "attribute",
    "relationship",
    "event",
    "world_rule",
    "entity_introduction",
  ]),
  subject_type: z.enum([
    "character",
    "world_element",
    "relationship",
    "scene",
    "unknown",
  ]),
  subject_label: z.string(),
  subject_ref_hint: z.string().uuid().optional().nullable(),
  predicate: z.string(),
  object_text: z.string(),
  paragraph_start: z.number().int().min(0),
  paragraph_end: z.number().int().min(0),
  confidence: z.enum(["low", "medium", "high"]),
});

export const ExtractedContradiction = z.object({
  summary: z.string(),
  conflicting_claim_ids: z.array(z.string().uuid()).default([]),
  paragraph_start: z.number().int().min(0),
  paragraph_end: z.number().int().min(0),
  confidence: z.enum(["low", "medium", "high"]),
});

export const ExtractedNewEntity = z.object({
  name: z.string(),
  kind: z.enum(["character", "world_element"]),
  category: z.string().optional().nullable(),
  paragraph_start: z.number().int().min(0),
  paragraph_end: z.number().int().min(0),
});

export const ExtractedContinuityResponse = z.object({
  claims: z.array(ExtractedClaimRaw).default([]),
  contradictions: z.array(ExtractedContradiction).default([]),
  new_entities: z.array(ExtractedNewEntity).default([]),
});

export type ExtractedClaimRawT = z.infer<typeof ExtractedClaimRaw>;
export type ExtractedContradictionT = z.infer<typeof ExtractedContradiction>;
export type ExtractedNewEntityT = z.infer<typeof ExtractedNewEntity>;
