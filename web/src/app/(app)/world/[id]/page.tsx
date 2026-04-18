import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { WorldElementForm } from "./world-form";
import type { WorldElement } from "@/lib/supabase/types";

export default async function WorldDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("world_elements")
    .select("*")
    .eq("id", id)
    .eq("project_id", project.id)
    .maybeSingle();

  if (!data) notFound();

  const w = data as WorldElement;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <Link
        href="/world"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" /> World
      </Link>
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          World element
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          {w.name || "Untitled"}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Category, name, and description are passed to Partner and scene assist as a
          canon line so generations respect this fact. Use a name that matches how it
          appears on the page when you care about mention counts.
        </p>
      </header>

      <WorldElementForm element={w} />
    </div>
  );
}
