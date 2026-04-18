import { askClaude, resolveModelKey } from "@/lib/ai/claude";
import { env } from "@/lib/env";
import { stripHtml } from "@/lib/html";
import { getOrCreateProject } from "@/lib/projects";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * When a romantic relationship exists, occasionally propose a relationship beat
 * (pending approval) based on scene content.
 */
export async function maybeProposeRelationshipBeat(
  sceneId: string,
): Promise<void> {
  if (!env.anthropicApiKey()) return;

  const supabase = await supabaseServer();
  const project = await getOrCreateProject();
  if (!project) return;

  const { data: scene } = await supabase
    .from("scenes")
    .select("chapter_id, content")
    .eq("id", sceneId)
    .maybeSingle();

  if (!scene?.chapter_id) return;

  const { data: chRow } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", scene.chapter_id)
    .maybeSingle();

  if (!chRow || chRow.project_id !== project.id) return;

  const chapterId = scene.chapter_id;
  const plain = stripHtml((scene.content as string) ?? "");
  if (plain.length < 120) return;

  const { data: pending } = await supabase
    .from("relationship_beats")
    .select("id")
    .eq("scene_id", sceneId)
    .eq("approval_status", "pending")
    .limit(1);
  if (pending?.length) return;

  const { data: rels } = await supabase
    .from("relationships")
    .select("id, type")
    .eq("project_id", project.id);

  const pool = rels ?? [];
  const romantic = pool.filter(
    (r) =>
      (r.type ?? "").toLowerCase().includes("romantic") ||
      (r.type ?? "").toLowerCase() === "romance",
  );
  const rel = romantic[0] ?? pool[0];
  if (!rel?.id) return;

  try {
    const user = `Scene prose (excerpt):\n${plain.slice(0, 1800)}\n\nReturn JSON only: {"propose":false} OR {"propose":true,"beat_label":"short snake_case label","intensity":-5 to 5,"notes":"one sentence"}\nOnly propose if there is a clear romantic beat (attraction spike, conflict in the ship, intimacy milestone). Otherwise {"propose":false}.`;

    const { text } = await askClaude({
      persona: "profiler",
      system:
        'You output JSON only. No markdown. Keys: propose (boolean), optional beat_label, intensity, notes.',
      user,
      model: resolveModelKey("quick"),
      temperature: 0.2,
      maxTokens: 220,
      projectId: project.id,
      contextType: "relationship_beat_proposal",
      contextId: sceneId,
    });

    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      propose?: boolean;
      beat_label?: string;
      intensity?: number;
      notes?: string;
    };
    if (!parsed.propose) return;

    await supabase.from("relationship_beats").insert({
      relationship_id: rel.id,
      chapter_id: chapterId,
      scene_id: sceneId,
      beat_label: parsed.beat_label ?? "beat",
      intensity: Math.max(-5, Math.min(5, parsed.intensity ?? 0)),
      notes: parsed.notes ?? null,
      approval_status: "pending",
    });
  } catch (e) {
    console.error("relationship beat proposal:", e);
  }
}
