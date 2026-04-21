import { supabaseServer } from "@/lib/supabase/server";

export type AiLogInput = {
  projectId: string | null;
  kind: string;
  summary: string;
  detail?: Record<string, unknown>;
  aiInteractionId?: string | null;
};

/** Best-effort append. Never throws — a failed log must not break the caller. */
export async function logAiActivity(entry: AiLogInput): Promise<void> {
  try {
    const supabase = await supabaseServer();
    await supabase.from("ai_log").insert({
      project_id: entry.projectId,
      kind: entry.kind,
      summary: entry.summary,
      detail: entry.detail ?? {},
      ai_interaction_id: entry.aiInteractionId ?? null,
    });
  } catch (e) {
    console.error("ai_log insert failed:", e);
  }
}
