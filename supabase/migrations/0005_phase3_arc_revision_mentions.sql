-- Phase 3 additions: arc tracker, revision history, and explicit @character backfill support.

create table if not exists scene_revisions (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid references scenes(id) on delete cascade not null,
  content text not null,
  wordcount int not null default 0,
  source text not null default 'autosave' check (source in ('autosave', 'manual_restore')),
  created_at timestamptz not null default now()
);

create index if not exists scene_revisions_scene_id_idx
  on scene_revisions(scene_id, created_at desc);

alter table scene_revisions enable row level security;

drop policy if exists scene_revisions_owner on scene_revisions;
create policy scene_revisions_owner on scene_revisions
for all
using (
  exists (
    select 1
    from scenes s
    join chapters c on c.id = s.chapter_id
    join projects p on p.id = c.project_id
    where s.id = scene_revisions.scene_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from scenes s
    join chapters c on c.id = s.chapter_id
    join projects p on p.id = c.project_id
    where s.id = scene_revisions.scene_id
      and p.user_id = auth.uid()
  )
);

create table if not exists scene_character_arcs (
  scene_id uuid references scenes(id) on delete cascade not null,
  character_id uuid references characters(id) on delete cascade not null,
  reader_knowledge text,
  character_knowledge text,
  arc_note text,
  updated_at timestamptz not null default now(),
  primary key (scene_id, character_id)
);

create index if not exists scene_character_arcs_character_id_idx
  on scene_character_arcs(character_id);

alter table scene_character_arcs enable row level security;

drop policy if exists scene_character_arcs_owner on scene_character_arcs;
create policy scene_character_arcs_owner on scene_character_arcs
for all
using (
  exists (
    select 1
    from scenes s
    join chapters c on c.id = s.chapter_id
    join projects p on p.id = c.project_id
    where s.id = scene_character_arcs.scene_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from scenes s
    join chapters c on c.id = s.chapter_id
    join projects p on p.id = c.project_id
    where s.id = scene_character_arcs.scene_id
      and p.user_id = auth.uid()
  )
);
