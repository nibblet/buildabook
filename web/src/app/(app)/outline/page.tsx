import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { loadSpine } from "@/lib/spine";
import { StructureTabs } from "@/components/structure-tabs";
import { NewChapterButton } from "@/components/new-chapter-button";
import type { Character } from "@/lib/supabase/types";
import { OutlineTree } from "./outline-tree";

export default async function OutlinePage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const [spine, { data: chars }] = await Promise.all([
    loadSpine(project.id),
    supabase
      .from("characters")
      .select("id, name")
      .eq("project_id", project.id),
  ]);

  const characters = (chars ?? []) as Pick<Character, "id" | "name">[];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Structure
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Outline
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Tree view of acts, beats, chapters, and scenes. Filter by POV or
            status. Click a scene or chapter to open it.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StructureTabs />
          <NewChapterButton projectId={project.id} variant="outline" />
        </div>
      </header>

      <OutlineTree
        spine={spine}
        characters={characters}
        targetWordcount={project.target_wordcount}
        projectId={project.id}
      />
    </div>
  );
}
