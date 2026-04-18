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
import type { WorldElement } from "@/lib/supabase/types";
import { deleteWorldElement, updateWorldElement } from "../actions";

const CATEGORIES = [
  "",
  "species",
  "magic_rule",
  "creature",
  "faction",
  "location",
  "item",
  "lore",
];

export function WorldElementForm({ element }: { element: WorldElement }) {
  const router = useRouter();
  const [, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      await updateWorldElement(element.id, {
        category: emptyToNull(fd.get("category")),
        name: emptyToNull(fd.get("name")),
        description: emptyToNull(fd.get("description")),
      });
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${element.name || "this"} world element"?`)) return;
    start(async () => {
      await deleteWorldElement(element.id);
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <select
                name="category"
                defaultValue={element.category ?? ""}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CATEGORIES.map((c) => (
                  <option key={c || "none"} value={c}>
                    {c ? c.replace("_", " ") : "—"}
                  </option>
                ))}
              </select>
            </div>
            <Field name="name" label="Name" defaultValue={element.name ?? ""} />
          </div>
          <Area
            name="description"
            label="Description"
            rows={12}
            defaultValue={element.description ?? ""}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/world"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Back to world
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

function Field({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input name={name} defaultValue={defaultValue} />
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
