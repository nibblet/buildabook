"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PLOT_TEMPLATES, type PlotTemplateId } from "@/lib/plot-templates";
import { applyPlotTemplate } from "./actions";

export function PlotTemplatePicker({ hasBeats }: { hasBeats: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PlotTemplateId>(
    PLOT_TEMPLATES[0]!.id,
  );
  const [mode, setMode] = useState<"append" | "replace">(
    hasBeats ? "append" : "replace",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const template = PLOT_TEMPLATES.find((t) => t.id === selected)!;

  function apply() {
    setError(null);
    start(async () => {
      try {
        await applyPlotTemplate(selected, mode);
        setOpen(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong.";
        setError(msg);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Apply template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Apply a plot template</DialogTitle>
          <DialogDescription>
            Seed your spine with a structural template. Append adds to the end
            of your current beats; replace is only available when no chapters
            or scenes reference your existing beats.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <ul className="space-y-1">
            {PLOT_TEMPLATES.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    selected === t.id
                      ? "border-primary bg-accent font-medium"
                      : "border-transparent",
                  )}
                >
                  <div>{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.beats.length} beats
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0 space-y-3 border-l pl-4">
            <div>
              <h4 className="font-serif text-lg font-semibold">
                {template.name}
              </h4>
              <p className="text-sm text-muted-foreground">{template.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Best for: {template.bestFor}
              </p>
            </div>
            <ol className="max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">
              {template.beats.map((b) => (
                <li
                  key={b.order_index}
                  className="rounded-md border bg-muted/30 p-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="muted">Act {b.act}</Badge>
                    <span className="font-medium">{b.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {b.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {hasBeats && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Mode
            </div>
            <div className="flex flex-wrap gap-2">
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5",
                  mode === "append" && "border-primary bg-background",
                )}
              >
                <input
                  type="radio"
                  name="apply-mode"
                  checked={mode === "append"}
                  onChange={() => setMode("append")}
                />
                Append to end
              </label>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5",
                  mode === "replace" && "border-primary bg-background",
                )}
              >
                <input
                  type="radio"
                  name="apply-mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                Replace all beats
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Replace fails if any chapter or scene still points at an existing
              beat. In that case, use append.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={apply} disabled={isPending}>
            {isPending
              ? "Applying…"
              : mode === "replace" && hasBeats
                ? `Replace with ${template.beats.length} beats`
                : `Add ${template.beats.length} beats`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
