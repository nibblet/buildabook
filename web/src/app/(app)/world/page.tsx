import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { createWorldElementDraft } from "./actions";
import type { WorldElement } from "@/lib/supabase/types";

export default async function WorldPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("world_elements")
    .select("*")
    .eq("project_id", project.id)
    .order("updated_at", { ascending: false });

  const rows = (data ?? []) as WorldElement[];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Lore
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            World
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Each element is summarized into the AI story context — rules of magic,
            places, factions, lore — so help requests do not contradict your bible.
            When prose uses an element&apos;s name, mentions roll up per chapter for
            tracking (same idea as character name counts).
          </p>
        </div>
        <form action={createWorldElementDraft}>
          <Button type="submit" size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> New element
          </Button>
        </form>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Track species, magic rules, locations — start with one card.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((w) => (
            <li key={w.id}>
              <Link href={`/world/${w.id}`}>
                <Card className="transition-colors hover:border-foreground/25">
                  <CardHeader className="py-4">
                    <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
                      <span>{w.name || "Untitled"}</span>
                      {w.category && (
                        <Badge variant="secondary">{w.category}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  {w.description && (
                    <CardContent className="line-clamp-3 pt-0 text-sm text-muted-foreground">
                      {w.description}
                    </CardContent>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
