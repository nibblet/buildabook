import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import type { ContinuityClaim } from "@/lib/supabase/types";

export default async function WorldCodexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data: el } = await supabase
    .from("world_elements")
    .select("id, name")
    .eq("id", id)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!el) notFound();

  const { data: claims } = await supabase
    .from("continuity_claims")
    .select("*")
    .eq("project_id", project.id)
    .eq("subject_world_element_id", id)
    .order("created_at", { ascending: false })
    .limit(80);

  const rows = (claims ?? []) as ContinuityClaim[];

  const byPred = new Map<string, ContinuityClaim[]>();
  for (const c of rows) {
    const arr = byPred.get(c.predicate) ?? [];
    arr.push(c);
    byPred.set(c.predicate, arr);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <Link
        href={`/world/${id}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" /> {el.name ?? "World element"}
      </Link>
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Continuity codex
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          What we know — {el.name ?? "lore"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Facts extracted from prose. Read-only.
        </p>
      </header>

      <div className="space-y-6">
        {byPred.size === 0 ? (
          <p className="text-sm text-muted-foreground">
            No continuity claims linked to this entry yet.
          </p>
        ) : (
          [...byPred.entries()].map(([pred, list]) => (
            <section key={pred}>
              <h2 className="mb-2 text-sm font-semibold capitalize">{pred}</h2>
              <ul className="space-y-2 text-sm">
                {list.map((c) => (
                  <li key={c.id} className="rounded-md border bg-card px-3 py-2">
                    {c.object_text}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {c.confidence} · {c.status}
                      {c.source_scene_id ? (
                        <>
                          {" "}
                          ·{" "}
                          <Link
                            href={`/scenes/${c.source_scene_id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            scene
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
