// Minimal TypeScript types for our Supabase tables.
// Keep in sync with supabase/migrations (e.g. 0001_init, 0004_app_feedback).

export type PersonaKey =
  | "partner"
  | "profiler"
  | "specialist"
  | "proofreader"
  | "analyst"
  | "extract"
  | "factcheck";

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
