import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import type { AiLogEntry } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("ai_log")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as AiLogEntry[];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Changelog
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          AI activity
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every AI-triggered change: compiles, reflections, extractions.
          Append-only.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {r.kind}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1">{r.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
