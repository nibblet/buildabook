"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { Character, Relationship } from "@/lib/supabase/types";
import { deleteRelationship, updateRelationship } from "../actions";

const REL_TYPES = ["", "romantic", "rival", "ally", "family", "other"];

export function RelationshipForm({
  relationship,
  characters,
}: {
  relationship: Relationship;
  characters: Character[];
}) {
  const router = useRouter();
  const [, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const charA = String(fd.get("char_a_id") ?? "").trim() || null;
    const charB = String(fd.get("char_b_id") ?? "").trim() || null;
    start(async () => {
      await updateRelationship(relationship.id, {
        char_a_id: charA,
        char_b_id: charB,
        type: emptyToNull(fd.get("type")),
        current_state: emptyToNull(fd.get("current_state")),
        arc_notes: emptyToNull(fd.get("arc_notes")),
      });
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm("Delete this relationship record?")) return;
    start(async () => {
      await deleteRelationship(relationship.id);
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <CharSelect
              name="char_a_id"
              label="Character A"
              characters={characters}
              initial={relationship.char_a_id}
            />
            <CharSelect
              name="char_b_id"
              label="Character B"
              characters={characters}
              initial={relationship.char_b_id}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <select
              name="type"
              defaultValue={relationship.type ?? ""}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {REL_TYPES.map((t) => (
                <option key={t || "unset"} value={t}>
                  {t || "—"}
                </option>
              ))}
            </select>
          </div>
          <Area
            name="current_state"
            label="Where they are now"
            rows={3}
            defaultValue={relationship.current_state ?? ""}
          />
          <Area
            name="arc_notes"
            label="Arc notes"
            rows={5}
            defaultValue={relationship.arc_notes ?? ""}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/relationships"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Back to relationships
        </Link>
        <div className="flex items-center gap-2">
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
          <Button type="submit" size="sm">
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

function CharSelect({
  name,
  label,
  characters,
  initial,
}: {
  name: string;
  label: string;
  characters: Character[];
  initial: string | null;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        name={name}
        defaultValue={initial ?? ""}
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
  );
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function Area({
  name,
  label,
  rows,
  defaultValue,
}: {
  name: string;
  label: string;
  rows: number;
  defaultValue: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea name={name} rows={rows} defaultValue={defaultValue} />
    </div>
  );
}
