"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { Character } from "@/lib/supabase/types";
import { deleteCharacter, updateCharacter } from "../actions";

export function CharacterForm({ character }: { character: Character }) {
  const router = useRouter();
  const [, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      await updateCharacter(character.id, {
        name: String(fd.get("name") || "").trim() || "Untitled",
        aliases: commaList(fd.get("aliases")),
        role: emptyToNull(fd.get("role")),
        species: emptyToNull(fd.get("species")),
        archetype: emptyToNull(fd.get("archetype")),
        appearance: emptyToNull(fd.get("appearance")),
        backstory: emptyToNull(fd.get("backstory")),
        wound: emptyToNull(fd.get("wound")),
        desire: emptyToNull(fd.get("desire")),
        need: emptyToNull(fd.get("need")),
        voice_notes: emptyToNull(fd.get("voice_notes")),
        powers: emptyToNull(fd.get("powers")),
      });
      router.refresh();
    });
  }

  function onDelete() {
    if (
      !confirm(
        `Delete "${character.name}"? Scenes referencing this POV may need updating.`,
      )
    )
      return;
    start(async () => {
      await deleteCharacter(character.id);
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <Field
            name="name"
            label="Name"
            required
            defaultValue={character.name}
          />
          <Field
            name="aliases"
            label="Aliases for @mentions"
            hint="Comma-separated nicknames or spellings (e.g. Zoe, Zoë)."
            defaultValue={(character.aliases ?? []).join(", ")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="role" label="Role" defaultValue={character.role ?? ""} />
            <Field
              name="species"
              label="Species"
              defaultValue={character.species ?? ""}
            />
          </div>
          <Field
            name="archetype"
            label="Archetype"
            defaultValue={character.archetype ?? ""}
          />
          <Area
            name="appearance"
            label="Appearance"
            rows={3}
            defaultValue={character.appearance ?? ""}
          />
          <Area
            name="backstory"
            label="Backstory"
            rows={4}
            defaultValue={character.backstory ?? ""}
          />
          <Area name="wound" label="Wound" rows={3} defaultValue={character.wound ?? ""} />
          <Area name="desire" label="Desire" rows={2} defaultValue={character.desire ?? ""} />
          <Area name="need" label="Need" rows={2} defaultValue={character.need ?? ""} />
          <Area
            name="voice_notes"
            label="Voice notes"
            rows={3}
            defaultValue={character.voice_notes ?? ""}
          />
          <Area name="powers" label="Powers / rules" rows={3} defaultValue={character.powers ?? ""} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/characters"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Back to characters
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

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function commaList(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function Field({
  name,
  label,
  hint,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {hint ? (
          <span className="ml-2 font-normal text-muted-foreground/90">{hint}</span>
        ) : null}
      </Label>
      <Input name={name} defaultValue={defaultValue} required={required} />
    </div>
  );
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
