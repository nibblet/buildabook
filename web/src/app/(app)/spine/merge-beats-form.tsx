"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Beat } from "@/lib/supabase/types";
import { mergeBeatsInto } from "./actions";

/** Merge two beats — keeps the “into” beat and removes the duplicate. */
export function MergeBeatsForm({ beats }: { beats: Beat[] }) {
  const [src, setSrc] = useState(beats[0]?.id ?? "");
  const [dst, setDst] = useState(beats[1]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!src || !dst || src === dst) {
      setError("Pick two different beats.");
      return;
    }
    start(async () => {
      try {
        await mergeBeatsInto(src, dst);
      } catch {
        setError("Merge failed.");
      }
    });
  }

  if (beats.length < 2) return null;

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Merge beats (Phase 1)
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Remove</Label>
          <select
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {beats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Into</Label>
          <select
            value={dst}
            onChange={(e) => setDst(e.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {beats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Merge
        </Button>
      </form>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
