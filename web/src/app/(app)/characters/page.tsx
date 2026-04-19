import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";
import { createCharacterDraft } from "./actions";
import type { Character } from "@/lib/supabase/types";
import {
  formatRoleLabel,
  formatSpeciesLabel,
} from "@/lib/characters/presets";

export default async function CharactersPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("characters")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at");

  const characters = (data ?? []) as Character[];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cast
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Characters
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Character sheets feed the Partner and inline AI with your cast — role,
            species, wants, voice, and powers — so scenes stay consistent with how you
            define people.
          </p>
        </div>
        <form action={createCharacterDraft}>
          <Button type="submit" size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> New character
          </Button>
        </form>
      </header>

      {characters.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No characters yet. Import from onboarding or add one.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {characters.map((c) => (
            <li key={c.id}>
              <Link href={`/characters/${c.id}`}>
                <Card className="transition-colors hover:border-foreground/25">
                  <CardHeader className="py-4">
                    <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
                      <span>{c.name}</span>
                      <div className="flex flex-wrap gap-1">
                        {c.role && (
                          <Badge variant="secondary">{formatRoleLabel(c.role)}</Badge>
                        )}
                        {c.species && (
                          <Badge variant="muted">{formatSpeciesLabel(c.species)}</Badge>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  {(c.desire || c.need) && (
                    <CardContent className="pt-0 text-sm text-muted-foreground">
                      {c.desire && (
                        <p>
                          <span className="font-medium text-foreground">
                            Desire:
                          </span>{" "}
                          {c.desire}
                        </p>
                      )}
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
