/**
 * @deprecated Phase 2 RAG is retired in favor of compiled wiki context.
 * This module is kept for historical data; no new code should import it.
 * A future cleanup migration may drop the `scene_chunks` table entirely.
 */
import { voyageEmbed } from "@/lib/ai/voyage";
import { stripHtml } from "@/lib/html";
import { supabaseServer } from "@/lib/supabase/server";

/** Split prose into chunks for embedding (~450 chars each, max 24). */
export function chunkPlainText(text: string, maxChars = 450): string[] {
  const t = text.trim();
  if (!t) return [];
  const out: string[] = [];
  for (let i = 0; i < t.length; i += maxChars) {
    out.push(t.slice(i, i + maxChars));
  }
  return out.slice(0, 24);
}

/** Replace all chunks for a scene with fresh embeddings (Phase 2 RAG). */
export async function rebuildSceneChunks(sceneId: string): Promise<void> {
  const supabase = await supabaseServer();
  const { data: scene } = await supabase
    .from("scenes")
    .select("content")
    .eq("id", sceneId)
    .maybeSingle();
  const html = scene?.content ?? "";
  const plain = stripHtml(html);
  const chunks = chunkPlainText(plain);

  await supabase.from("scene_chunks").delete().eq("scene_id", sceneId);

  if (chunks.length === 0) return;

  const embeddings = await voyageEmbed(chunks);
  if (!embeddings || embeddings.length !== chunks.length) return;

  const rows = chunks.map((content, chunk_index) => ({
    scene_id: sceneId,
    chunk_index,
    content,
    // pgvector column — PostgREST accepts float array JSON
    embedding: embeddings[chunk_index],
  }));

  const { error } = await supabase.from("scene_chunks").insert(rows);
  if (error) console.error("scene_chunks insert:", error);
}
