-- Project Notes: per-project free-form scratchpad for AI-assisted outlining.
-- Each project has at most one scratchpad row (kind='scratchpad').
-- `chapter` / `scene` kinds are reserved for future scoped brainstorming.

create table if not exists project_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (kind in ('scratchpad', 'chapter', 'scene')),
  target_id uuid,
  content text not null default '',
  last_proposal jsonb,
  last_promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_notes_scratchpad_uq
  on project_notes (project_id) where kind = 'scratchpad';

create unique index if not exists project_notes_target_uq
  on project_notes (project_id, kind, target_id) where target_id is not null;

alter table project_notes enable row level security;

drop policy if exists project_notes_owner on project_notes;
create policy project_notes_owner on project_notes for all using (
  exists (select 1 from projects p where p.id = project_notes.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = project_notes.project_id and p.user_id = auth.uid())
);
