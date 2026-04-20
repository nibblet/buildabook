import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { loadSpine } from "@/lib/spine";
import { StructureTabs } from "@/components/structure-tabs";
import type { Character } from "@/lib/supabase/types";
import { Corkboard } from "./corkboard";

export default async function PlanPage() {
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
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Structure
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Corkboard
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Index cards for chapters and scenes. Drag chapters to reorder.
            Drag scenes within a chapter to reorder them.
          </p>
        </div>
        <StructureTabs />
      </header>

      <Corkboard spine={spine} characters={characters} />
    </div>
  );
}
