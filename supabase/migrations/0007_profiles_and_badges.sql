-- User profiles, badges, and avatar storage for the redesigned Settings page.

-- Profiles -------------------------------------------------------------------
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;

drop policy if exists profiles_owner on profiles;
create policy profiles_owner on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- User badges ----------------------------------------------------------------
-- `badge_id` is a string key owned by application code (see lib/badges.ts).
create table if not exists user_badges (
  user_id uuid references auth.users(id) on delete cascade not null,
  badge_id text not null,
  earned_at timestamptz default now(),
  primary key (user_id, badge_id)
);

alter table user_badges enable row level security;

drop policy if exists user_badges_owner on user_badges;
create policy user_badges_owner on user_badges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Avatars bucket -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
