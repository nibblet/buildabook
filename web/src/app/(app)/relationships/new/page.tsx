import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { createRelationship } from "../actions";
import type { Character } from "@/lib/supabase/types";

const REL_TYPES = ["", "romantic", "rival", "ally", "family", "other"];

export default async function NewRelationshipPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("characters")
    .select("*")
    .eq("project_id", project.id)
    .order("name");

  const characters = (data ?? []) as Character[];

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6 md:p-8">
      <Link
        href="/relationships"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" /> Relationships
      </Link>
      <header>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          New relationship
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose two characters and how they connect.
        </p>
      </header>

      {characters.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          You need at least two characters.{" "}
          <Link href="/characters" className="underline">
            Add characters
          </Link>{" "}
          first.
        </p>
      ) : (
        <form action={createRelationship}>
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Character A
                </Label>
                <select
                  name="char_a_id"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">—</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Character B
                </Label>
                <select
                  name="char_b_id"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">—</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <select
                  name="type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {REL_TYPES.map((t) => (
                    <option key={t || "unset"} value={t}>
                      {t || "—"}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>
          <div className="mt-4 flex justify-end">
            <Button type="submit">Create</Button>
          </div>
        </form>
      )}
    </div>
  );
}
