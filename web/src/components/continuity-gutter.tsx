"use client";

import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  confirmAnnotationAction,
  dismissAnnotationAction,
  listAnnotationsForScene,
} from "@/app/(app)/scenes/[id]/continuity/actions";
import {
  annotationVisibleForDial,
  type ContinuityDial,
} from "@/lib/ai/continuity/dial";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useContinuityIdle } from "@/hooks/use-continuity-idle";
import { useTypingSprint } from "@/hooks/use-typing-sprint";

function paragraphLayout(editor: Editor | null): { index: number; top: number }[] {
  if (!editor) return [];
  const ed = editor.view.dom;
  const br = ed.getBoundingClientRect();
  const items: { index: number; top: number }[] = [];
  let i = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "paragraph") {
      try {
        const inner = Math.min(pos + 1, editor.state.doc.content.size);
        const coords = editor.view.coordsAtPos(inner);
        items.push({ index: i++, top: coords.top - br.top });
      } catch {
        items.push({ index: i++, top: 0 });
      }
    }
    return true;
  });
  return items;
}

function cursorParagraphIndex(editor: Editor | null): number {
  if (!editor) return -1;
  const from = editor.state.selection.from;
  let idx = 0;
  let found = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "paragraph") {
      if (from >= pos && from < pos + node.nodeSize) found = idx;
      idx++;
    }
    return true;
  });
  return found;
}

type Ann = {
  id: string;
  paragraph_index: number;
  tier: "A" | "B" | "C";
  kind: string;
  summary: string;
  status: string;
};

function loadSessionDismissSet(sceneId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(`continuity_sess_${sceneId}`);
    const ids = JSON.parse(raw ?? "[]") as string[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function ContinuityGutter({
  editor,
  sceneId,
  dial,
  refreshKey,
}: {
  editor: Editor | null;
  sceneId: string;
  dial: ContinuityDial;
  refreshKey: number;
}) {
  const [annotations, setAnnotations] = useState<Ann[]>([]);
  const [layout, setLayout] = useState<{ index: number; top: number }[]>([]);
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(() =>
    loadSessionDismissSet(sceneId),
  );

  const idle = useContinuityIdle(editor);
  const { isSprinting } = useTypingSprint(editor);
  const curPar = cursorParagraphIndex(editor);

  useEffect(() => {
    let cancelled = false;
    void listAnnotationsForScene(sceneId).then((rows) => {
      if (cancelled) return;
      setAnnotations(
        rows.map((r) => ({
          ...r,
          tier: r.tier as "A" | "B" | "C",
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [sceneId, refreshKey]);

  useEffect(() => {
    if (!editor) return;
    const update = () =>
      requestAnimationFrame(() => setLayout(paragraphLayout(editor)));
    update();
    editor.on("transaction", update);
    window.addEventListener("resize", update);
    return () => {
      void editor.off("transaction", update);
      window.removeEventListener("resize", update);
    };
  }, [editor, refreshKey, annotations.length]);

  const visible = useMemo(() => {
    const tierBAcceptable = idle && !isSprinting && dial !== "quiet";
    const tierBParagraphOk = (pi: number) =>
      curPar < 0 || curPar !== pi;

    let tierBCount = 0;
    const maxB = 5;

    const out: Ann[] = [];
    const sorted = [...annotations].sort((a, b) => {
      if (a.tier !== b.tier) return a.tier === "A" ? -1 : 1;
      return a.paragraph_index - b.paragraph_index;
    });

    for (const a of sorted) {
      if (sessionDismissed.has(a.id)) continue;
      if (!annotationVisibleForDial(a.tier, dial)) continue;

      if (a.tier === "A") {
        out.push(a);
        continue;
      }
      if (a.tier === "B") {
        if (!tierBAcceptable || !tierBParagraphOk(a.paragraph_index))
          continue;
        if (tierBCount >= maxB) continue;
        tierBCount++;
        out.push(a);
      }
    }

    return out;
  }, [
    annotations,
    dial,
    sessionDismissed,
    idle,
    isSprinting,
    curPar,
  ]);

  const byParagraph = useMemo(() => {
    const m = new Map<number, Ann[]>();
    for (const a of visible) {
      const arr = m.get(a.paragraph_index) ?? [];
      arr.push(a);
      m.set(a.paragraph_index, arr);
    }
    return m;
  }, [visible]);

  async function reloadAnnotations() {
    const rows = await listAnnotationsForScene(sceneId);
    setAnnotations(
      rows.map((r) => ({
        ...r,
        tier: r.tier as "A" | "B" | "C",
      })),
    );
  }

  async function dismissPermanent(id: string) {
    await dismissAnnotationAction(id);
    await reloadAnnotations();
  }

  async function confirmPromote(id: string) {
    await confirmAnnotationAction(id);
    await reloadAnnotations();
  }

  function dismissSession(id: string) {
    const next = new Set(sessionDismissed);
    next.add(id);
    setSessionDismissed(next);
    sessionStorage.setItem(
      `continuity_sess_${sceneId}`,
      JSON.stringify([...next]),
    );
  }

  if (!editor) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative w-9 shrink-0 select-none border-r border-border/40 pr-1">
        <div className="relative min-h-[50vh]">
          {Array.from(byParagraph.entries()).map(([index, list]) => {
            const top = layout.find((l) => l.index === index)?.top ?? 0;
            const primary = list[0];
            const extra = list.length - 1;
            return (
              <div
                key={`${index}-${primary.id}`}
                className="absolute flex flex-col gap-0.5"
                style={{ top: Math.max(0, top), transform: "translateY(-2px)" }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "h-2 w-2 rounded-full border border-background shadow",
                        primary.tier === "A"
                          ? "bg-amber-500"
                          : "bg-muted-foreground/45",
                      )}
                      aria-label="Continuity note"
                    />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-xs text-xs leading-snug"
                  >
                    <p className="font-medium">Continuity Editor</p>
                    <p>{primary.summary}</p>
                    {extra > 0 ? (
                      <p className="mt-1 text-muted-foreground">
                        +{extra} more in this paragraph
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => void confirmPromote(primary.id)}
                      >
                        Confirm to bible
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => dismissSession(primary.id)}
                      >
                        Dismiss (session)
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => void dismissPermanent(primary.id)}
                      >
                        Hide always
                      </Button>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
