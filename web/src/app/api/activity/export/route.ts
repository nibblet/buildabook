import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import type { AiLogEntry } from "@/lib/supabase/types";

export async function GET() {
  const project = await getOrCreateProject();
  if (!project) return new Response("Unauthorized", { status: 401 });

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("ai_log")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as AiLogEntry[];

  const lines: string[] = [`# AI activity log`, ""];
  for (const r of rows) {
    lines.push(
      `- \`${new Date(r.created_at).toISOString()}\` **${r.kind}** — ${r.summary}`,
    );
  }

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-log-${project.id}.md"`,
    },
  });
}
