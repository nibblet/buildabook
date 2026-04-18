import { voyageEmbed } from "@/lib/ai/voyage";
import { supabaseServer } from "@/lib/supabase/server";

type MatchRow = {
  scene_id: string;
  chunk_index: number;
  content: string;
  distance: number;
};

/** Retrieve similar prior prose for continuity-safe Partner context (Phase 2). */
export async function retrieveRagContinuity(args: {
  projectId: string;
  excludeSceneId: string | null;
  queryText: string;
  limit?: number;
}): Promise<string | null> {
  const trimmed = args.queryText.trim().slice(0, 1600);
  if (trimmed.length < 50) return null;

  const batch = await voyageEmbed([trimmed]);
  const embedding = batch?.[0];
  if (!embedding) return null;

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("match_scene_chunks", {
    query_embedding: embedding,
    filter_project: args.projectId,
    exclude_scene: args.excludeSceneId,
    match_count: args.limit ?? 8,
  });

  if (error) {
    console.error("match_scene_chunks:", error.message);
    return null;
  }

  const rows = (data ?? []) as MatchRow[];
  if (!rows.length) return null;

  const snippets = rows
    .filter((r) => r.content?.trim())
    .map((r, i) => `(snip ${i + 1}) ${r.content.trim()}`);

  if (!snippets.length) return null;

  return snippets.join("\n\n");
}
