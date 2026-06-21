-- Persist active book per user via profiles.last_workspace_id (column pre-exists).
-- Backfill from each user's most recently updated project.

alter table profiles
  drop constraint if exists profiles_last_workspace_id_fkey;

-- Clear orphaned pointers (e.g. deleted projects or stale IDs from prior tooling).
update profiles p
set last_workspace_id = null
where p.last_workspace_id is not null
  and not exists (
    select 1 from projects pr where pr.id = p.last_workspace_id
  );

-- One active book per user: pick the project they touched most recently.
update profiles p
set last_workspace_id = sub.project_id
from (
  select distinct on (pr.user_id)
    pr.user_id,
    pr.id as project_id
  from projects pr
  order by pr.user_id, pr.updated_at desc nulls last, pr.created_at desc
) sub
where p.id = sub.user_id
  and p.last_workspace_id is null;

alter table profiles
  add constraint profiles_last_workspace_id_fkey
  foreign key (last_workspace_id) references projects(id) on delete set null;
