import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { SpineBeatList } from "./spine-beat-list";
import { MergeBeatsForm } from "./merge-beats-form";
import { PlotTemplatePicker } from "./plot-template-picker";
import { StructureTabs } from "@/components/structure-tabs";
import type { Beat } from "@/lib/supabase/types";

export default async function SpinePage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("beats")
    .select("*")
    .eq("project_id", project.id)
    .order("order_index", { ascending: true });

  const beats = (data ?? []) as Beat[];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Structure
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Story spine
          </h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Drag beats to reorder your roadmap. Edits save per field (blur) or
            when you tap Save beat.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StructureTabs />
          <PlotTemplatePicker hasBeats={beats.length > 0} />
        </div>
      </header>

      {beats.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No beats yet — apply a plot template above, finish onboarding, or
          seed your project.
        </p>
      ) : (
        <>
          <SpineBeatList beats={beats} projectId={project.id} />
          <MergeBeatsForm beats={beats} />
        </>
      )}
    </div>
  );
}
