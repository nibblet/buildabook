-- Migration 010 — compiled wiki documents (derived artifacts).
--
-- The manuscript + raw entity rows are authoritative inputs. A compiled wiki
-- doc is the regenerable output of a deterministic function over those inputs.
-- Versioned via status='current' | 'superseded'; prior `current` gets demoted
-- atomically on compile.

create table if not exists wiki_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'character', 'world', 'relationship', 'thread', 'storyline', 'index'
  )),
  doc_key text not null,
  version int not null default 1,
  status text not null default 'current' check (status in ('current', 'superseded')),
  title text,
  body_md text not null default '',
  source_signature text,
  source_refs jsonb not null default '{}'::jsonb,
  model text,
  compiled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists wiki_documents_current_uq
  on wiki_documents (project_id, doc_type, doc_key)
  where status = 'current';

create index if not exists wiki_documents_project_idx
  on wiki_documents (project_id);

create index if not exists wiki_documents_doc_idx
  on wiki_documents (project_id, doc_type, doc_key, version desc);

alter table wiki_documents enable row level security;

drop policy if exists wiki_documents_owner on wiki_documents;
create policy wiki_documents_owner on wiki_documents for all using (
  exists (select 1 from projects p where p.id = wiki_documents.project_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from projects p where p.id = wiki_documents.project_id and p.user_id = auth.uid())
);
