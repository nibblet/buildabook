// Minimal TypeScript types for our Supabase tables.
// Keep in sync with supabase/migrations (e.g. 0001_init, 0004_app_feedback).

export type PersonaKey =
  | "partner"
  | "profiler"
  | "specialist"
  | "proofreader"
  | "analyst"
  | "extract"
  | "factcheck"
  | "continuity_editor"
  | "compile_character"
  | "compile_world"
  | "compile_relationship"
  | "compile_index"
  | "reflect_session"
  | "reflect_chapter"
  | "reflect_story_so_far";

export type Project = {
  id: string;
  user_id: string;
  title: string;
  premise: string | null;
  subgenre: string | null;
  paranormal_type: string | null;
  heat_level: string | null;
  target_wordcount: number;
  style_notes: string | null;
  persona_aliases: Record<string, string>;
  /** Which deploy / product slice created this row; must match server WRITING_PROFILE. */
  writing_profile: string;
  /** Gutter / inline Continuity Editor sensitivity. */
  continuity_dial?: "quiet" | "helpful" | "vigilant";
  created_at: string;
  updated_at: string;
};

export type Character = {
  id: string;
  project_id: string;
  name: string;
  role: string | null;
  species: string | null;
  archetype: string | null;
  appearance: string | null;
  backstory: string | null;
  wound: string | null;
  desire: string | null;
  need: string | null;
  voice_notes: string | null;
  powers: string | null;
  aliases: string[];
  created_at: string;
};

export type Beat = {
  id: string;
  project_id: string;
  order_index: number | null;
  act: number | null;
  beat_type: string | null;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  target_chapter: number | null;
  created_at: string;
};

export type FactCheckWarning = {
  message: string;
  severity?: "info" | "warn";
};

export type Chapter = {
  id: string;
  project_id: string;
  order_index: number | null;
  title: string | null;
  pov_character_id: string | null;
  synopsis: string | null;
  beat_ids: string[];
  wordcount: number;
  status: "planned" | "drafting" | "done";
  updated_at: string;
  fact_check_warnings?: FactCheckWarning[] | null;
};

export type Scene = {
  id: string;
  chapter_id: string;
  order_index: number | null;
  title: string | null;
  pov_character_id: string | null;
  beat_ids: string[];
  goal: string | null;
  conflict: string | null;
  outcome: string | null;
  content: string | null;
  wordcount: number;
  status: "planned" | "drafting" | "done";
  updated_at: string;
  /** SHA-256 of normalized scene text; used to skip re-extraction. */
  continuity_content_hash?: string | null;
  continuity_extracted_at?: string | null;
  continuity_extractor_version?: number | null;
  /** Pre-write scratchpad (intent / takeaway / character shift / notes). */
  blueprint?: unknown;
};

export type ContinuityClaim = {
  id: string;
  project_id: string;
  source_scene_id: string;
  source_paragraph_start: number;
  source_paragraph_end: number;
  kind: string;
  subject_type: string;
  subject_label: string;
  subject_character_id: string | null;
  subject_world_element_id: string | null;
  subject_relationship_id: string | null;
  proposed_destination_type:
    | "character"
    | "world_element"
    | "relationship"
    | "scene"
    | "unresolved"
    | null;
  proposed_world_category: string | null;
  resolution_status: "resolved" | "candidate" | "ambiguous" | "unresolved";
  resolution_note: string | null;
  predicate: string;
  object_text: string;
  confidence: "low" | "medium" | "high";
  status: "auto" | "confirmed" | "rejected" | "superseded";
  superseded_by: string | null;
  tier: "A" | "B" | "C" | null;
  extractor_version: number;
  created_at: string;
  updated_at: string;
};

export type ContinuityAnnotation = {
  id: string;
  project_id: string;
  scene_id: string;
  paragraph_index: number;
  tier: "A" | "B" | "C";
  kind: string;
  summary: string;
  detail: string | null;
  claim_ids: string[];
  conflicting_claim_ids: string[];
  status: "pending" | "shown" | "dismissed" | "resolved";
  dismissed_session_id: string | null;
  created_at: string;
};

export type SceneCharacterArc = {
  scene_id: string;
  character_id: string;
  reader_knowledge: string | null;
  character_knowledge: string | null;
  arc_note: string | null;
  updated_at: string;
};

export type SceneRevision = {
  id: string;
  scene_id: string;
  content: string;
  wordcount: number;
  source: "autosave" | "manual_restore";
  created_at: string;
};

export type WorldElement = {
  id: string;
  project_id: string;
  category: string | null;
  name: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  aliases: string[];
  created_at: string;
  updated_at: string;
};

export type StyleSample = {
  id: string;
  project_id: string;
  label: string | null;
  content: string | null;
  is_default: boolean;
  created_at: string;
};

export type OpenThread = {
  id: string;
  project_id: string;
  question: string;
  opened_in_chapter_id: string | null;
  opened_in_scene_id: string | null;
  resolved: boolean;
  resolved_in_chapter_id: string | null;
  notes: string | null;
  created_at: string;
};

export type Relationship = {
  id: string;
  project_id: string;
  char_a_id: string | null;
  char_b_id: string | null;
  type: string | null;
  current_state: string | null;
  arc_notes: string | null;
  created_at: string;
};

export type RelationshipBeat = {
  id: string;
  relationship_id: string;
  chapter_id: string | null;
  scene_id: string | null;
  beat_label: string | null;
  intensity: number | null;
  notes: string | null;
  created_at: string;
  approval_status?: string | null;
};

/** Writing-session snapshot (wrap-up), not Supabase Auth. */
export type WritingSession = {
  id: string;
  project_id: string;
  summary: string | null;
  writer_note: string | null;
  last_scene_id: string | null;
  last_action: string | null;
  ended_at: string;
};

/** Free-text product feedback (Phase 3); developer reads via Admin + service role or Supabase UI. */
export type AppFeedback = {
  id: string;
  project_id: string | null;
  user_id: string;
  author_email: string | null;
  body: string;
  page_context: string | null;
  created_at: string;
};

export type AiInteraction = {
  id: string;
  project_id: string | null;
  persona: PersonaKey | string;
  context_type: string | null;
  context_id: string | null;
  prompt: string | null;
  response: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
};

export type WikiDocType =
  | "character"
  | "world"
  | "relationship"
  | "thread"
  | "storyline"
  | "index";

export type WikiDocument = {
  id: string;
  project_id: string;
  doc_type: WikiDocType;
  doc_key: string;
  version: number;
  status: "current" | "superseded";
  title: string | null;
  body_md: string;
  source_signature: string | null;
  source_refs: Record<string, unknown>;
  model: string | null;
  compiled_at: string;
  created_at: string;
};

export type Reflection = {
  id: string;
  project_id: string;
  kind: string;
  target_id: string | null;
  body: string;
  input_signature: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  ai_interaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AiLogEntry = {
  id: string;
  project_id: string | null;
  kind: string;
  summary: string;
  detail: Record<string, unknown>;
  ai_interaction_id: string | null;
  created_at: string;
};
