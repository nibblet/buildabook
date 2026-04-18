-- Reset all novella app data so onboarding can run again.
-- Does NOT delete auth.users — the same email can sign in and get a fresh project.
--
-- Run in Supabase → SQL Editor (use the correct project: paul_personal / prod).

-- Optional: only delete YOUR projects (recommended on a shared Supabase org).
-- Uncomment ONE of the DELETE variants below.

-- ─── Option A — single user (replace email) ─────────────────────────────────
-- DELETE FROM projects
-- WHERE user_id = (
--   SELECT id FROM auth.users WHERE lower(email) = lower('your-email@example.com') LIMIT 1
-- );

-- ─── Option B — every project in this database (solo dev only) ────────────
DELETE FROM projects;

-- Orphan AI logs that were stored without a project_id (rare); safe to clear.
DELETE FROM ai_interactions WHERE project_id IS NULL;

-- Verify empty (should all be 0):
-- SELECT
--   (SELECT count(*) FROM projects) AS projects,
--   (SELECT count(*) FROM chapters) AS chapters,
--   (SELECT count(*) FROM scenes) AS scenes,
--   (SELECT count(*) FROM characters) AS characters;
