/**
 * CLI backfill using service role. From web/: npx tsx scripts/backfill-character-mentions.ts
 * env: PROJECT_ID optional — limit to one project by id
 * env: WRITING_PROFILE optional — when set without PROJECT_ID, only projects with this profile (matches deploy)
 */
import { createClient } from "@supabase/supabase-js";
import {
  applyMentionBackfill,
  buildMentionReplacements,
} from "../src/lib/mentions/character-mention-backfill";

async function backfillProject(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
) {
  const [{ data: chars }, { data: chapters }] = await Promise.all([
    supabase.from("characters").select("name, aliases").eq("project_id", projectId),
    supabase.from("chapters").select("id").eq("project_id", projectId),
  ]);

  const replacements = buildMentionReplacements(
    (chars ?? []) as { name: string; aliases: string[] | null }[],
  );
  if (replacements.length === 0) {
    console.log(`  project ${projectId}: no mention patterns, skip`);
    return { updated: 0 };
  }

  const chapterIds = (chapters as { id: string }[] | null)?.map((c) => c.id) ?? [];
  if (chapterIds.length === 0) {
    console.log(`  project ${projectId}: no chapters, skip`);
    return { updated: 0 };
  }

  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, content")
    .in("chapter_id", chapterIds);

  let updated = 0;
  for (const scene of (scenes as { id: string; content: string | null }[] | null) ?? []) {
    const current = String(scene.content ?? "");
    if (!current.trim()) continue;
    const { content, changed } = applyMentionBackfill(current, replacements);
    if (!changed || content === current) continue;
    const { error } = await supabase
      .from("scenes")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", scene.id);
    if (error) throw error;
    updated += 1;
  }
  console.log(`  project ${projectId}: updated ${updated} scene(s)`);
  return { updated };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const scoped = process.env.PROJECT_ID?.trim();
  if (scoped) {
    await backfillProject(supabase, scoped);
    return;
  }

  let projQuery = supabase.from("projects").select("id");
  const profile = process.env.WRITING_PROFILE?.trim();
  if (profile) projQuery = projQuery.eq("writing_profile", profile);

  const { data: projects, error } = await projQuery;
  if (error) throw error;

  let total = 0;
  for (const p of projects ?? []) {
    const r = await backfillProject(supabase, p.id);
    total += r.updated;
  }
  console.log(`Done. Total scenes updated: ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
