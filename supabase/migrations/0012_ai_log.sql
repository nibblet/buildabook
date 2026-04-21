-- Migration 012 — append-only AI activity log.
--
-- Every AI-triggered state change writes one row here. Queried for the
-- /activity surface and can be exported as markdown.

create table if not exists ai_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  kind text not null,
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  ai_interaction_id uuid references ai_interactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_log_project_idx
  on ai_log (project_id, created_at desc);

alter table ai_log enable row level security;

drop policy if exists ai_log_owner on ai_log;
create policy ai_log_owner on ai_log for all using (
  ai_log.project_id is null
  or exists (select 1 from projects p where p.id = ai_log.project_id and p.user_id = auth.uid())
) with check (
  ai_log.project_id is null
  or exists (select 1 from projects p where p.id = ai_log.project_id and p.user_id = auth.uid())
);
