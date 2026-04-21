"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListPlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { bulkAddScenesToChapter } from "../actions";

export function BulkAddScenesButton({ chapterId }: { chapterId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [aiExpand, setAiExpand] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const parsed = useMemo(
    () =>
      raw
        .split("\n")
        .map((l) => l.replace(/^[\s\-\*•–]+/, "").trim())
        .filter((l) => l.length > 0),
    [raw],
  );

  function submit() {
    setError("");
    start(async () => {
      try {
        await bulkAddScenesToChapter(chapterId, parsed, { aiExpand });
        setOpen(false);
        setRaw("");
        setAiExpand(false);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not add scenes.",
        );
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <ListPlus className="h-3 w-3" /> Add scenes in bulk
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add scenes in bulk</DialogTitle>
          <DialogDescription>
            One scene title per line. Bullet markers are stripped. Scenes are
            appended to the end of this chapter with status <em>planned</em>.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={10}
          placeholder={`Mara reads the letter
She meets Idris at the harbour
The storm turns
- Confrontation on the pier
...`}
          className="font-mono text-sm"
        />

        <div className="flex items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={aiExpand}
              onChange={(e) => setAiExpand(e.target.checked)}
            />
            <Sparkles className="h-3.5 w-3.5" />
            AI-draft goal / conflict / outcome for each
          </label>
          <span className="text-xs text-muted-foreground">
            {parsed.length} scene{parsed.length === 1 ? "" : "s"}
          </span>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || parsed.length === 0}
          >
            {pending
              ? aiExpand
                ? "Drafting…"
                : "Adding…"
              : `Add ${parsed.length} scene${parsed.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
