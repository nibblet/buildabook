import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getOrCreateProject } from "@/lib/projects";
import { supabaseServer } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";
import type { StyleSample } from "@/lib/supabase/types";

export default async function ProjectSettingsPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data: samples } = await supabase
    .from("style_samples")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" /> Back to dashboard
        </Link>
        <p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Project
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Settings
        </h1>
      </div>
      <SettingsForm
        project={project}
        styleSamples={(samples ?? []) as StyleSample[]}
      />
    </div>
  );
}
