-- Migration 011 — cached AI reflections (session wrap, chapter debrief, etc).
--
-- Keyed by (project_id, kind, target_id) with an input_signature that gates
-- regeneration: on a fresh request, compute the signature over the inputs and
-- skip the AI call if it matches what produced the current row.

create table if not exists reflections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null,
  target_id uuid,
  body text not null default '',
  input_signature text not null,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 4),
  ai_interaction_id uuid references ai_interactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reflections_project_kind_uq
  on reflections (project_id, kind)
  where target_id is null;

create unique index if not exists reflections_project_kind_target_uq
  on reflections (project_id, kind, target_id)
  where target_id is not null;

create index if not exists reflections_project_idx on reflections (project_id);

drop trigger if exists reflections_updated_at on reflections;
create trigger reflections_updated_at before update on reflections
  for each row execute function set_updated_at();

alter table reflections enable row level security;

drop policy if exists reflections_owner on reflections;
create policy reflections_owner on reflections for all using (
  exists (select 1 from projects p where p.id = reflections.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = reflections.project_id and p.user_id = auth.uid())
);
