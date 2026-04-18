"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { wrapWritingSession } from "./session-actions";

export function WrapSessionForm() {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        await wrapWritingSession(note);
        setNote("");
      } catch {
        setError("Couldn’t save the session wrap. Try again.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="writer_note" className="text-xs text-muted-foreground">
          Note to self (optional)
        </Label>
        <Textarea
          id="writer_note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Tomorrow I want to…"
          className="mt-1"
          disabled={pending}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="gap-2">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Wrapping…
          </>
        ) : (
          "Wrap up for today"
        )}
      </Button>
    </form>
  );
}
