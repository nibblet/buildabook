import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { RelationshipForm } from "./relationship-form";
import type { Character, Relationship } from "@/lib/supabase/types";

export default async function RelationshipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const [{ data: rel }, { data: chars }] = await Promise.all([
    supabase
      .from("relationships")
      .select("*")
      .eq("id", id)
      .eq("project_id", project.id)
      .maybeSingle(),
    supabase.from("characters").select("*").eq("project_id", project.id).order("name"),
  ]);

  if (!rel) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <Link
        href="/relationships"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" /> Relationships
      </Link>
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Relationship
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Edit connection
        </h1>
      </header>

      <RelationshipForm
        relationship={rel as Relationship}
        characters={(chars ?? []) as Character[]}
      />
    </div>
  );
}
