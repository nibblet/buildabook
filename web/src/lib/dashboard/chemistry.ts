import { supabaseServer } from "@/lib/supabase/server";

export type ChemistryPoint = {
  chapterOrder: number;
  intensity: number;
  chapterId: string | null;
};

/** Intensity samples along the romance arc for the dashboard sparkline (Phase 2). */
export async function loadPrimaryRelationshipChemistry(
  projectId: string,
): Promise<{ relationshipId: string | null; points: ChemistryPoint[] }> {
  const supabase = await supabaseServer();

  const { data: rels } = await supabase
    .from("relationships")
    .select("id, type")
    .eq("project_id", projectId);

  const pool = rels ?? [];
  const romantic =
    pool.find((r) =>
      (r.type ?? "").toLowerCase().includes("romantic"),
    ) ?? pool[0];

  if (!romantic?.id) return { relationshipId: null, points: [] };

  const { data: beats } = await supabase
    .from("relationship_beats")
    .select("intensity, chapter_id, approval_status")
    .eq("relationship_id", romantic.id);

  const rows =
    (beats ?? []) as {
      intensity: number | null;
      chapter_id: string | null;
      approval_status: string | null;
    }[];

  const filtered = rows.filter((r) => r.approval_status !== "dismissed");

  const chIds = [
    ...new Set(
      filtered.map((r) => r.chapter_id).filter(Boolean),
    ),
  ] as string[];

  let orderById = new Map<string, number>();
  if (chIds.length) {
    const { data: chs } = await supabase
      .from("chapters")
      .select("id, order_index")
      .in("id", chIds);
    orderById = new Map(
      (chs ?? []).map((c) => [c.id as string, c.order_index ?? 0]),
    );
  }

  const points: ChemistryPoint[] = filtered
    .filter((r) => r.chapter_id)
    .map((r) => ({
      chapterOrder: orderById.get(r.chapter_id!) ?? 0,
      intensity: Math.max(-5, Math.min(5, r.intensity ?? 0)),
      chapterId: r.chapter_id,
    }))
    .sort((a, b) => a.chapterOrder - b.chapterOrder);

  return { relationshipId: romantic.id, points };
}
