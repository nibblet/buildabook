-- Deployment-scoped workspace: same Supabase, separate Vercel deploys filter by writing_profile.

alter table projects add column if not exists writing_profile text not null default 'pnr_dawn';

create index if not exists projects_user_writing_profile_idx on projects (user_id, writing_profile);
