-- Continuity Editor: extracted claims + margin annotations + project dial

alter table projects add column if not exists continuity_dial text not null default 'helpful'
  check (continuity_dial in ('quiet', 'helpful', 'vigilant'));

alter table scenes add column if not exists continuity_content_hash text;
alter table scenes add column if not exists continuity_extracted_at timestamptz;
alter table scenes add column if not exists continuity_extractor_version int default 1;

-- Atomic facts from scene prose (auto-extracted; may be promoted to canon)
create table if not exists continuity_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  source_scene_id uuid not null references scenes(id) on delete cascade,
  source_paragraph_start int not null default 0,
  source_paragraph_end int not null default 0,
  kind text not null,
  subject_type text not null,
  subject_label text not null default '',
  subject_character_id uuid references characters(id) on delete set null,
  subject_world_element_id uuid references world_elements(id) on delete set null,
  subject_relationship_id uuid references relationships(id) on delete set null,
  predicate text not null default '',
  object_text text not null default '',
  confidence text not null default 'medium',
  status text not null default 'auto',
  superseded_by uuid references continuity_claims(id) on delete set null,
  tier text,
  extractor_version int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists continuity_claims_project_scene_idx
  on continuity_claims (project_id, source_scene_id);
create index if not exists continuity_claims_project_status_idx
  on continuity_claims (project_id, status)
  where status <> 'superseded';
create index if not exists continuity_claims_subject_char_idx
  on continuity_claims (subject_character_id)
  where subject_character_id is not null;
create index if not exists continuity_claims_subject_world_idx
  on continuity_claims (subject_world_element_id)
  where subject_world_element_id is not null;

-- Gutter annotations derived from claims / contradictions
create table if not exists continuity_annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  scene_id uuid not null references scenes(id) on delete cascade,
  paragraph_index int not null default 0,
  tier text not null,
  kind text not null,
  summary text not null default '',
  detail text,
  claim_ids uuid[] not null default '{}',
  conflicting_claim_ids uuid[] not null default '{}',
  status text not null default 'pending',
  dismissed_session_id text,
  created_at timestamptz default now()
);

create index if not exists continuity_annotations_scene_idx
  on continuity_annotations (scene_id);
create index if not exists continuity_annotations_project_idx
  on continuity_annotations (project_id);

-- RLS -------------------------------------------------------------------------
alter table continuity_claims enable row level security;
alter table continuity_annotations enable row level security;

drop policy if exists continuity_claims_owner on continuity_claims;
create policy continuity_claims_owner on continuity_claims for all using (
  exists (select 1 from projects p where p.id = continuity_claims.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = continuity_claims.project_id and p.user_id = auth.uid())
);

drop policy if exists continuity_annotations_owner on continuity_annotations;
create policy continuity_annotations_owner on continuity_annotations for all using (
  exists (select 1 from projects p where p.id = continuity_annotations.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = continuity_annotations.project_id and p.user_id = auth.uid())
);

drop trigger if exists continuity_claims_updated_at on continuity_claims;
create trigger continuity_claims_updated_at before update on continuity_claims
  for each row execute function set_updated_at();
