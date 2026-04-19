import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { CharacterForm } from "./character-form";
import type { Character } from "@/lib/supabase/types";

export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("characters")
    .select("*")
    .eq("id", id)
    .eq("project_id", project.id)
    .maybeSingle();

  if (!data) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <Link
        href="/characters"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" /> Characters
      </Link>
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Character sheet
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          {(data as Character).name}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Details you enter here roll into the AI&apos;s universal story context with
          your voice and project settings — fuller sheets reduce inconsistency when you
          ask for rewrites or continuations.
        </p>
        <p className="mt-2 text-sm">
          <Link
            href={`/characters/${id}/codex`}
            className="text-foreground underline-offset-4 hover:underline"
          >
            View continuity codex
          </Link>{" "}
          <span className="text-muted-foreground">(auto-extracted from scenes)</span>
        </p>
      </header>

      <CharacterForm key={id} character={data as Character} />
    </div>
  );
}
