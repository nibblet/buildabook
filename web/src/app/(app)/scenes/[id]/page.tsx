import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { SceneFocusClient } from "./scene-focus-client";
import type { Beat, Chapter, Character, Project, Scene } from "@/lib/supabase/types";

export default async function SceneFocusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data: scene } = await supabase
    .from("scenes")
    .select("*, chapters!inner(id, title, project_id)")
    .eq("id", id)
    .maybeSingle();
  if (!scene) notFound();

  const chapter = (scene.chapters as unknown as Pick<Chapter, "id" | "title" | "project_id">) || null;
  if (!chapter || chapter.project_id !== project.id) notFound();

  const [{ data: chars }, { data: beats }] = await Promise.all([
    supabase.from("characters").select("*").eq("project_id", project.id),
    supabase.from("beats").select("*").eq("project_id", project.id).order("order_index"),
  ]);

  const sceneClean = { ...(scene as Scene & { chapters?: unknown }) };
  delete (sceneClean as { chapters?: unknown }).chapters;

  return (
    <SceneFocusClient
      project={project as Project}
      scene={sceneClean as Scene}
      chapter={chapter as Pick<Chapter, "id" | "title">}
      characters={(chars ?? []) as Character[]}
      beats={(beats ?? []) as Beat[]}
      backHref={`/chapters/${chapter.id}`}
      BackLink={
        <Link
          href={`/chapters/${chapter.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" /> Back to chapter
        </Link>
      }
    />
  );
}
