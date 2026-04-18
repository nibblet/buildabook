-- Phase 2: continuity, character mentions, chapter fact-check cache, relationship beat workflow.

-- Character mention counts (per chapter roll-up; scene optional).
create table if not exists character_mentions (
  character_id uuid references characters(id) on delete cascade not null,
  chapter_id uuid references chapters(id) on delete cascade not null,
  scene_id uuid references scenes(id) on delete set null,
  mention_count int not null default 1,
  updated_at timestamptz default now(),
  primary key (character_id, chapter_id)
);
create index if not exists character_mentions_chapter_id_idx on character_mentions(chapter_id);

alter table chapters add column if not exists fact_check_warnings jsonb default '[]'::jsonb;

-- pending | confirmed | dismissed — AI suggestions start as pending.
alter table relationship_beats add column if not exists approval_status text default 'confirmed';

create index if not exists relationship_beats_approval_idx on relationship_beats(approval_status);

update relationship_beats set approval_status = 'confirmed' where approval_status is null;

-- Vector search for RAG (after you have embeddings, optional tuning):
-- create index scene_chunks_embedding_ivfflat on scene_chunks
-- using ivfflat (embedding vector_cosine_ops) with (lists = 50);

-- Match prior scene chunks for the same project (exclude current scene).
create or replace function match_scene_chunks(
  query_embedding vector(1024),
  filter_project uuid,
  exclude_scene uuid default null,
  match_count int default 8
)
returns table (
  scene_id uuid,
  chunk_index int,
  content text,
  distance float
)
language sql
stable
parallel safe
as $$
  select sc.scene_id, sc.chunk_index, sc.content,
         (sc.embedding <=> query_embedding)::float as distance
  from scene_chunks sc
  inner join scenes s on s.id = sc.scene_id
  inner join chapters c on c.id = s.chapter_id
  where c.project_id = filter_project
    and (exclude_scene is null or sc.scene_id <> exclude_scene)
    and sc.embedding is not null
  order by sc.embedding <=> query_embedding
  limit greatest(1, least(match_count, 24));
$$;

alter table character_mentions enable row level security;

drop policy if exists character_mentions_owner on character_mentions;
create policy character_mentions_owner on character_mentions for all using (
  exists (
    select 1 from characters ch
    join projects p on p.id = ch.project_id
    where ch.id = character_mentions.character_id and p.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from characters ch
    join projects p on p.id = ch.project_id
    where ch.id = character_mentions.character_id and p.user_id = auth.uid()
  )
);

grant execute on function match_scene_chunks(vector, uuid, uuid, int) to authenticated;
grant execute on function match_scene_chunks(vector, uuid, uuid, int) to service_role;
