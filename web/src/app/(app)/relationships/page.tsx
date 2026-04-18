import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import type { Character, Relationship } from "@/lib/supabase/types";
import { PendingRelationshipBeats } from "./pending-beats";

export default async function RelationshipsPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const [{ data: relRows }, { data: charRows }, { data: relIdRows }] =
    await Promise.all([
      supabase
        .from("relationships")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false }),
      supabase.from("characters").select("*").eq("project_id", project.id),
      supabase.from("relationships").select("id").eq("project_id", project.id),
    ]);

  const rels = (relRows ?? []) as Relationship[];
  const chars = (charRows ?? []) as Character[];
  const nameById = new Map(chars.map((c) => [c.id, c.name]));

  const relIds = (relIdRows ?? []).map((r) => r.id);
  let pendingBeats: {
    id: string;
    beat_label: string | null;
    intensity: number | null;
    notes: string | null;
    scene_id: string | null;
  }[] = [];
  if (relIds.length) {
    const { data: pen } = await supabase
      .from("relationship_beats")
      .select("id, beat_label, intensity, notes, scene_id")
      .in("relationship_id", relIds)
      .eq("approval_status", "pending");
    pendingBeats = pen ?? [];
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Romance & dynamics
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Relationships
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Pair characters to power the dashboard chemistry arc and scene-based
            relationship-beat proposals. &quot;Where you are&quot; and arc notes are
            yours for planning now; wiring them into Partner alongside characters is on
            the roadmap.
          </p>
        </div>
        <Button size="sm" className="gap-1" asChild>
          <Link href="/relationships/new">
            <Plus className="h-4 w-4" /> New relationship
          </Link>
        </Button>
      </header>

      <PendingRelationshipBeats beats={pendingBeats} />

      {chars.length < 2 && (
        <p className="text-sm text-muted-foreground">
          Add at least two characters first, then link them here.
        </p>
      )}

      {rels.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No relationships tracked yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rels.map((r) => {
            const a = r.char_a_id ? nameById.get(r.char_a_id) : "—";
            const b = r.char_b_id ? nameById.get(r.char_b_id) : "—";
            return (
              <li key={r.id}>
                <Link href={`/relationships/${r.id}`}>
                  <Card className="transition-colors hover:border-foreground/25">
                    <CardHeader className="py-4">
                      <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
                        <span>
                          {a} ↔ {b}
                        </span>
                        {r.type && (
                          <Badge variant="secondary">{r.type}</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    {r.current_state && (
                      <CardContent className="pt-0 text-sm text-muted-foreground">
                        {r.current_state}
                      </CardContent>
                    )}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
