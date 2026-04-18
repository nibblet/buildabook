-- Migration 001 — initial schema for the novella writing app.
-- Run against both `bab-prod` and `bab-staging` Supabase projects.
--
-- Matches files/novella-app-architecture-v2.md §4.

-- Required extensions --------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- Projects -------------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  premise text,
  subgenre text default 'paranormal_romance',
  paranormal_type text,
  heat_level text default 'steamy',
  target_wordcount int default 30000,
  style_notes text,
  persona_aliases jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists projects_user_id_idx on projects(user_id);

-- Characters -----------------------------------------------------------------
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  role text,
  species text,
  archetype text,
  appearance text,
  backstory text,
  wound text,
  desire text,
  need text,
  voice_notes text,
  powers text,
  aliases text[] default '{}',
  created_at timestamptz default now()
);
create index if not exists characters_project_id_idx on characters(project_id);

-- Beats ----------------------------------------------------------------------
create table if not exists beats (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  order_index int,
  act int,
  beat_type text,
  title text,
  description text,
  why_it_matters text,
  target_chapter int,
  created_at timestamptz default now()
);
create index if not exists beats_project_id_idx on beats(project_id);

-- Chapters -------------------------------------------------------------------
create table if not exists chapters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  order_index int,
  title text,
  pov_character_id uuid references characters(id) on delete set null,
  synopsis text,
  beat_ids uuid[] default '{}',
  wordcount int default 0,
  status text default 'planned',
  updated_at timestamptz default now()
);
create index if not exists chapters_project_id_idx on chapters(project_id);

-- Scenes ---------------------------------------------------------------------
create table if not exists scenes (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters(id) on delete cascade not null,
  order_index int,
  title text,
  pov_character_id uuid references characters(id) on delete set null,
  beat_ids uuid[] default '{}',
  goal text,
  conflict text,
  outcome text,
  content text,
  wordcount int default 0,
  status text default 'planned',
  updated_at timestamptz default now()
);
create index if not exists scenes_chapter_id_idx on scenes(chapter_id);

-- Relationships --------------------------------------------------------------
create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  char_a_id uuid references characters(id) on delete cascade,
  char_b_id uuid references characters(id) on delete cascade,
  type text,
  current_state text,
  arc_notes text,
  created_at timestamptz default now()
);
create index if not exists relationships_project_id_idx on relationships(project_id);

create table if not exists relationship_beats (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid references relationships(id) on delete cascade not null,
  chapter_id uuid references chapters(id) on delete set null,
  scene_id uuid references scenes(id) on delete set null,
  beat_label text,
  intensity int default 0,
  notes text,
  created_at timestamptz default now()
);

-- World elements -------------------------------------------------------------
create table if not exists world_elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  category text,
  name text,
  description text,
  metadata jsonb default '{}'::jsonb,
  aliases text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists world_elements_project_id_idx on world_elements(project_id);

create table if not exists element_mentions (
  element_id uuid references world_elements(id) on delete cascade,
  chapter_id uuid references chapters(id) on delete cascade,
  scene_id uuid references scenes(id) on delete set null,
  mention_count int default 1,
  primary key (element_id, chapter_id)
);

-- Style samples --------------------------------------------------------------
create table if not exists style_samples (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  label text,
  content text,
  is_default bool default false,
  created_at timestamptz default now()
);
create index if not exists style_samples_project_id_idx on style_samples(project_id);

-- Project tropes -------------------------------------------------------------
create table if not exists project_tropes (
  project_id uuid references projects(id) on delete cascade not null,
  trope text,
  primary key (project_id, trope)
);

-- Open threads ---------------------------------------------------------------
create table if not exists open_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  question text not null,
  opened_in_chapter_id uuid references chapters(id) on delete set null,
  opened_in_scene_id uuid references scenes(id) on delete set null,
  resolved boolean default false,
  resolved_in_chapter_id uuid references chapters(id) on delete set null,
  notes text,
  created_at timestamptz default now()
);
create index if not exists open_threads_project_id_idx on open_threads(project_id);

-- Scene chunks (Phase 2 RAG) -------------------------------------------------
create table if not exists scene_chunks (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid references scenes(id) on delete cascade not null,
  chunk_index int,
  content text,
  embedding vector(1024)
);
-- Note: ivfflat index created later when table has data.

-- AI interactions log --------------------------------------------------------
create table if not exists ai_interactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  persona text,
  context_type text,
  context_id uuid,
  prompt text,
  response text,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 4),
  created_at timestamptz default now()
);
create index if not exists ai_interactions_project_id_idx on ai_interactions(project_id);
create index if not exists ai_interactions_created_at_idx on ai_interactions(created_at desc);

-- Sessions -------------------------------------------------------------------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  summary text,
  last_scene_id uuid references scenes(id) on delete set null,
  last_action text,
  ended_at timestamptz default now()
);
create index if not exists sessions_project_id_idx on sessions(project_id);

-- Reader shares --------------------------------------------------------------
create table if not exists reader_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  token text unique not null,
  scope text default 'latest_chapter',
  scope_ref uuid,
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- updated_at trigger ---------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at before update on projects
  for each row execute function set_updated_at();

drop trigger if exists chapters_updated_at on chapters;
create trigger chapters_updated_at before update on chapters
  for each row execute function set_updated_at();

drop trigger if exists scenes_updated_at on scenes;
create trigger scenes_updated_at before update on scenes
  for each row execute function set_updated_at();

drop trigger if exists world_elements_updated_at on world_elements;
create trigger world_elements_updated_at before update on world_elements
  for each row execute function set_updated_at();

-- RLS ------------------------------------------------------------------------
-- All tables are scoped to the owning user through projects.user_id.

alter table projects enable row level security;
alter table characters enable row level security;
alter table beats enable row level security;
alter table chapters enable row level security;
alter table scenes enable row level security;
alter table relationships enable row level security;
alter table relationship_beats enable row level security;
alter table world_elements enable row level security;
alter table element_mentions enable row level security;
alter table style_samples enable row level security;
alter table project_tropes enable row level security;
alter table open_threads enable row level security;
alter table scene_chunks enable row level security;
alter table ai_interactions enable row level security;
alter table sessions enable row level security;
alter table reader_shares enable row level security;

-- Projects: direct ownership
drop policy if exists projects_owner on projects;
create policy projects_owner on projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Generic "owned through projects" helper policies
drop policy if exists characters_owner on characters;
create policy characters_owner on characters for all using (
  exists (select 1 from projects p where p.id = characters.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = characters.project_id and p.user_id = auth.uid())
);

drop policy if exists beats_owner on beats;
create policy beats_owner on beats for all using (
  exists (select 1 from projects p where p.id = beats.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = beats.project_id and p.user_id = auth.uid())
);

drop policy if exists chapters_owner on chapters;
create policy chapters_owner on chapters for all using (
  exists (select 1 from projects p where p.id = chapters.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = chapters.project_id and p.user_id = auth.uid())
);

drop policy if exists scenes_owner on scenes;
create policy scenes_owner on scenes for all using (
  exists (
    select 1 from chapters c
    join projects p on p.id = c.project_id
    where c.id = scenes.chapter_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from chapters c
    join projects p on p.id = c.project_id
    where c.id = scenes.chapter_id and p.user_id = auth.uid()
  )
);

drop policy if exists relationships_owner on relationships;
create policy relationships_owner on relationships for all using (
  exists (select 1 from projects p where p.id = relationships.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = relationships.project_id and p.user_id = auth.uid())
);

drop policy if exists relationship_beats_owner on relationship_beats;
create policy relationship_beats_owner on relationship_beats for all using (
  exists (
    select 1 from relationships r
    join projects p on p.id = r.project_id
    where r.id = relationship_beats.relationship_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from relationships r
    join projects p on p.id = r.project_id
    where r.id = relationship_beats.relationship_id and p.user_id = auth.uid()
  )
);

drop policy if exists world_elements_owner on world_elements;
create policy world_elements_owner on world_elements for all using (
  exists (select 1 from projects p where p.id = world_elements.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = world_elements.project_id and p.user_id = auth.uid())
);

drop policy if exists element_mentions_owner on element_mentions;
create policy element_mentions_owner on element_mentions for all using (
  exists (
    select 1 from world_elements w
    join projects p on p.id = w.project_id
    where w.id = element_mentions.element_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from world_elements w
    join projects p on p.id = w.project_id
    where w.id = element_mentions.element_id and p.user_id = auth.uid()
  )
);

drop policy if exists style_samples_owner on style_samples;
create policy style_samples_owner on style_samples for all using (
  exists (select 1 from projects p where p.id = style_samples.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = style_samples.project_id and p.user_id = auth.uid())
);

drop policy if exists project_tropes_owner on project_tropes;
create policy project_tropes_owner on project_tropes for all using (
  exists (select 1 from projects p where p.id = project_tropes.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = project_tropes.project_id and p.user_id = auth.uid())
);

drop policy if exists open_threads_owner on open_threads;
create policy open_threads_owner on open_threads for all using (
  exists (select 1 from projects p where p.id = open_threads.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = open_threads.project_id and p.user_id = auth.uid())
);

drop policy if exists scene_chunks_owner on scene_chunks;
create policy scene_chunks_owner on scene_chunks for all using (
  exists (
    select 1 from scenes s
    join chapters c on c.id = s.chapter_id
    join projects p on p.id = c.project_id
    where s.id = scene_chunks.scene_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from scenes s
    join chapters c on c.id = s.chapter_id
    join projects p on p.id = c.project_id
    where s.id = scene_chunks.scene_id and p.user_id = auth.uid()
  )
);

drop policy if exists ai_interactions_owner on ai_interactions;
create policy ai_interactions_owner on ai_interactions for all using (
  ai_interactions.project_id is null
  or exists (select 1 from projects p where p.id = ai_interactions.project_id and p.user_id = auth.uid())
) with check (
  ai_interactions.project_id is null
  or exists (select 1 from projects p where p.id = ai_interactions.project_id and p.user_id = auth.uid())
);

drop policy if exists sessions_owner on sessions;
create policy sessions_owner on sessions for all using (
  exists (select 1 from projects p where p.id = sessions.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = sessions.project_id and p.user_id = auth.uid())
);

drop policy if exists reader_shares_owner on reader_shares;
create policy reader_shares_owner on reader_shares for all using (
  exists (select 1 from projects p where p.id = reader_shares.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = reader_shares.project_id and p.user_id = auth.uid())
);
