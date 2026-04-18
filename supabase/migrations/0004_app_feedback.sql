-- Phase 3 — in-app feedback for the author → developer (stored in Postgres; review in Admin or Supabase UI).

create table if not exists app_feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade not null,
  author_email text,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 12000),
  page_context text,
  created_at timestamptz default now()
);

create index if not exists app_feedback_created_at_idx on app_feedback(created_at desc);
create index if not exists app_feedback_user_id_idx on app_feedback(user_id);

alter table app_feedback enable row level security;

drop policy if exists app_feedback_insert_own on app_feedback;
create policy app_feedback_insert_own on app_feedback
  for insert with check (auth.uid() = user_id);

drop policy if exists app_feedback_select_own on app_feedback;
create policy app_feedback_select_own on app_feedback
  for select using (auth.uid() = user_id);
