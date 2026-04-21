"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Proposal } from "@/lib/ai/extract-notes";
import { promoteProposal, type PromoteSelection } from "./actions";

export function PromoteDialog({
  proposal,
  open,
  onOpenChange,
}: {
  proposal: Proposal;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const initialSel = useMemo<PromoteSelection>(
    () => ({
      beatKeys: proposal.beats.map((b) => b.key),
      characterKeys: proposal.characters.map((c) => c.key),
      chapterKeys: proposal.chapters.map((c) => c.key),
      sceneKeys: proposal.scenes.map((s) => s.key),
    }),
    [proposal],
  );
  const [sel, setSel] = useState<PromoteSelection>(initialSel);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [pending, start] = useTransition();

  function toggle<K extends keyof PromoteSelection>(group: K, key: string) {
    setSel((prev) => {
      const arr = prev[group];
      const next = arr.includes(key)
        ? arr.filter((k) => k !== key)
        : [...arr, key];
      return { ...prev, [group]: next };
    });
  }

  function isChecked<K extends keyof PromoteSelection>(group: K, key: string) {
    return sel[group].includes(key);
  }

  function commit() {
    setError("");
    setResult("");
    start(async () => {
      try {
        const r = await promoteProposal(proposal, sel);
        setResult(
          `Added ${r.beatsCreated} beat${plural(r.beatsCreated)}, ${r.charactersCreated} character${plural(r.charactersCreated)}, ${r.chaptersCreated} chapter${plural(r.chaptersCreated)}, ${r.scenesCreated} scene${plural(r.scenesCreated)}.`,
        );
        setTimeout(() => onOpenChange(false), 1200);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not commit proposal.",
        );
      }
    });
  }

  const total =
    sel.beatKeys.length +
    sel.characterKeys.length +
    sel.chapterKeys.length +
    sel.sceneKeys.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review proposal</DialogTitle>
          <DialogDescription>
            Uncheck anything you don&apos;t want. Your scratchpad notes are
            kept as-is — nothing is overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          <Group
            title="Beats"
            emptyLabel="No new beats proposed."
            items={proposal.beats.map((b) => ({
              key: b.key,
              primary: b.title,
              secondary: b.description ?? undefined,
              meta: b.act ? `Act ${b.act}` : undefined,
              checked: isChecked("beatKeys", b.key),
              onToggle: () => toggle("beatKeys", b.key),
            }))}
          />
          <Group
            title="Characters"
            emptyLabel="No new characters proposed."
            items={proposal.characters.map((c) => ({
              key: c.key,
              primary: c.name,
              secondary: [c.archetype, c.wound, c.desire]
                .filter(Boolean)
                .join(" · "),
              meta: c.role ?? undefined,
              checked: isChecked("characterKeys", c.key),
              onToggle: () => toggle("characterKeys", c.key),
            }))}
          />
          <Group
            title="Chapters"
            emptyLabel="No new chapters proposed."
            items={proposal.chapters.map((c) => ({
              key: c.key,
              primary: c.title,
              secondary: c.synopsis ?? undefined,
              meta: c.pov_character_name
                ? `POV: ${c.pov_character_name}`
                : undefined,
              checked: isChecked("chapterKeys", c.key),
              onToggle: () => toggle("chapterKeys", c.key),
            }))}
          />
          <Group
            title="Scenes"
            emptyLabel="No new scenes proposed."
            items={proposal.scenes.map((s) => ({
              key: s.key,
              primary: s.title,
              secondary: [s.goal, s.conflict, s.outcome]
                .filter(Boolean)
                .join(" · "),
              meta: s.chapter_key ?? s.chapter_title ?? undefined,
              checked: isChecked("sceneKeys", s.key),
              onToggle: () => toggle("sceneKeys", s.key),
            }))}
          />
          {proposal.open_questions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Open questions</h3>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {proposal.open_questions.map((q, i) => (
                  <li key={i}>— {q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {result && (
          <div className="rounded-md border border-green-500/40 bg-green-500/10 p-2 text-sm text-green-700 dark:text-green-300">
            {result}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={commit}
            disabled={pending || total === 0}
          >
            {pending ? "Committing…" : `Commit ${total} selected`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Group({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: Array<{
    key: string;
    primary: string;
    secondary?: string;
    meta?: string;
    checked: boolean;
    onToggle: () => void;
  }>;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li
              key={it.key}
              className="flex items-start gap-2 rounded-md border bg-card p-2"
            >
              <input
                type="checkbox"
                checked={it.checked}
                onChange={it.onToggle}
                className="mt-1 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {it.primary}
                  </span>
                  {it.meta && (
                    <Badge variant="muted" className="shrink-0 text-xs">
                      {it.meta}
                    </Badge>
                  )}
                </div>
                {it.secondary && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {it.secondary}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
}
