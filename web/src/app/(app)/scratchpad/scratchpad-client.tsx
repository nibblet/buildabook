"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Proposal } from "@/lib/ai/extract-notes";
import { PromoteDialog } from "./promote-dialog";
import { proposeFromScratchpad, saveScratchpad } from "./actions";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ScratchpadClient({
  initialContent,
  initialProposal,
  lastPromotedAt,
}: {
  initialContent: string;
  initialProposal: Proposal | null;
  lastPromotedAt: string | null;
}) {
  const [content, setContent] = useState(initialContent);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [proposal, setProposal] = useState<Proposal | null>(initialProposal);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [proposeError, setProposeError] = useState<string>("");
  const [proposePending, startPropose] = useTransition();
  const dirtyRef = useRef(false);

  // Debounced autosave on change.
  useEffect(() => {
    if (!dirtyRef.current) return;
    setSaveState("saving");
    const handle = setTimeout(async () => {
      try {
        await saveScratchpad(content);
        setSaveState("saved");
        dirtyRef.current = false;
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => clearTimeout(handle);
  }, [content]);

  function onChange(v: string) {
    setContent(v);
    dirtyRef.current = true;
  }

  function onPropose() {
    setProposeError("");
    startPropose(async () => {
      try {
        // Ensure latest content is saved first.
        if (dirtyRef.current) {
          await saveScratchpad(content);
          dirtyRef.current = false;
        }
        const p = await proposeFromScratchpad();
        setProposal(p);
        setDialogOpen(true);
      } catch (e) {
        setProposeError(
          e instanceof Error ? e.message : "Could not propose structure.",
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <SaveBadge state={saveState} />
        {lastPromotedAt && (
          <span>Last promoted {new Date(lastPromotedAt).toLocaleString()}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onPropose}
            disabled={proposePending || !content.trim()}
            className="gap-2"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {proposePending ? "Proposing…" : "Propose structure"}
          </Button>
          {proposal && !dialogOpen && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDialogOpen(true)}
            >
              Review last proposal
            </Button>
          )}
        </div>
      </div>

      {proposeError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {proposeError}
        </div>
      )}

      <Textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="# Chapter 7 ideas
- Mara finds the letter
- She meets Idris at the harbour
- ...
Markdown is fine. Bullets, headings, questions — whatever helps you think."
        className="min-h-[70vh] font-mono text-sm leading-relaxed"
      />

      {proposal && (
        <PromoteDialog
          proposal={proposal}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1">
        <Save className="h-3 w-3" /> saving…
      </span>
    );
  if (state === "saved")
    return (
      <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
        <Check className="h-3 w-3" /> saved
      </span>
    );
  if (state === "error")
    return <span className="text-destructive">save failed</span>;
  return null;
}
