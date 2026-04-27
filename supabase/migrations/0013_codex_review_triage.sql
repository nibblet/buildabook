-- Codex review triage: proposed routing and category metadata.

alter table continuity_claims
  add column if not exists proposed_destination_type text
    check (proposed_destination_type in ('character', 'world_element', 'relationship', 'scene', 'unresolved')),
  add column if not exists proposed_world_category text,
  add column if not exists resolution_status text not null default 'unresolved'
    check (resolution_status in ('resolved', 'candidate', 'ambiguous', 'unresolved')),
  add column if not exists resolution_note text;

create index if not exists continuity_claims_review_triage_idx
  on continuity_claims (project_id, status, confidence, resolution_status)
  where status = 'auto';

create index if not exists continuity_claims_subject_relationship_idx
  on continuity_claims (subject_relationship_id)
  where subject_relationship_id is not null;
