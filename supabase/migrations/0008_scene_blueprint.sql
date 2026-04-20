-- Scene Blueprint: a JSONB scratchpad for pre-write intent on each scene.
-- Shape is enforced in application code (see web/src/lib/scene-blueprint.ts).
-- Kept on the scenes row so the editor can load it in one query.

alter table scenes
  add column if not exists blueprint jsonb not null default '{}'::jsonb;
